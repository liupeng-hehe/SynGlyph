"""
Offline active learning replay: L0 / U / V / T partitions, hybrid-aligned acquisition options,
rolling instability history, warm-start vs scratch training.
"""

from __future__ import annotations

import hashlib
import math
import json
import random
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Literal

import torch
from torch.utils.data import DataLoader

from letter_sequence.al.acquisition_policy import (
    HybridNormConfig,
    apply_cost_penalty,
    estimate_label_cost,
    rerank_batch_with_diversity,
    score_hybrid_candidates,
)
from letter_sequence.al.batch_uncertainty import batch_uncertainty_for_texts
from letter_sequence.al.experiment_train_config import default_train_cfg, merge_train_cfg
from letter_sequence.al.policy_config import AcquisitionPolicyConfig
from letter_sequence.al.samplers import sample_random, sample_topk
from letter_sequence.al.text_stats import (
    build_unit_counts_from_texts,
    coverage_gain_score,
    instability_score_replay_cold,
    segment_novelty_score,
)
from letter_sequence.al.uncertainty import uncertainty_scores_batch
from letter_sequence.data.experiment_io import (
    examples_to_legacy_jsonl_path,
    load_canonical_examples,
    resolve_dataset_paths,
)
from letter_sequence.data.sequence_dataset import LetterSequenceDataset, collate_letter_batch
from letter_sequence.eval.experiment_metrics import compute_cost_metrics, evaluate_extended_metrics, measure_inference_latency_ms
from letter_sequence.models.model_factory import build_model, normalize_model_family
from letter_sequence.paths import experiment_run_dir, repo_root
from letter_sequence.training.io import load_checkpoint
from letter_sequence.training.train_loop import eval_epoch_multitask_loss, run_training

AcquisitionMode = Literal["random", "legacy_boundary_only", "hybrid"]
ReplayTrainingMode = Literal["warm_start", "from_scratch"]


def _git_sha() -> str | None:
    try:
        root = repo_root()
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()[:64]
    except OSError:
        pass
    return None


def _file_sha256(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:64]


def _eval_val_multitask_loss(
    model: torch.nn.Module,
    val_jsonl: Path,
    cfg: dict[str, Any],
    device: torch.device,
) -> float | None:
    val_ds = LetterSequenceDataset(val_jsonl, split="val")
    if len(val_ds) == 0:
        return None
    loss_w = cfg.get("loss_weights", {})
    bs = cfg["train"].get("batch_size", 8)
    val_loader = DataLoader(val_ds, batch_size=bs, shuffle=False, collate_fn=collate_letter_batch)
    mt, _ = eval_epoch_multitask_loss(model, val_loader, device, loss_w)
    return float(mt)


def run_active_learning_replay(
    *,
    dataset_version_id: str,
    model_family: str,
    acquisition_mode: AcquisitionMode,
    replay_training_mode: ReplayTrainingMode,
    policy: AcquisitionPolicyConfig | None = None,
    train_cfg: dict[str, Any] | None = None,
    experiment_run_id: str | None = None,
    initial_seed_size: int = 10,
    acquisition_batch_size: int = 5,
    max_rounds: int = 50,
    max_labeled_total: int = 100,
    random_seed: int = 42,
    train_epochs_per_round: int = 5,
    hybrid_norm: HybridNormConfig | None = None,
) -> dict[str, Any]:
    """
    Replay with frozen labels: train → score U → acquire batch → reveal → repeat.

    ``acquisition_mode``:
    - ``random``: uniform random from U
    - ``legacy_boundary_only``: boundary entropy only (legacy simulator)
    - ``hybrid``: five-feature hybrid aligned with online scorer (no KB in offline v1)

    ``replay_training_mode``:
    - ``from_scratch``: new weights each round (default seed protocol)
    - ``warm_start``: load previous round ``letter_sequence.pt`` before training
    """
    pol = policy or AcquisitionPolicyConfig()
    norm_cfg = hybrid_norm or HybridNormConfig(lower_percentile=5.0, upper_percentile=95.0, collapse_fallback=0.5)
    weights = pol.weights_for_scoring()

    eid = experiment_run_id or str(uuid.uuid4())
    out = experiment_run_dir(eid)
    paths = resolve_dataset_paths(dataset_version_id)
    examples_path = paths["examples_jsonl"]
    if not examples_path.is_file():
        raise FileNotFoundError(examples_path)

    all_ex = load_canonical_examples(examples_path)
    train_ex = [e for e in all_ex if e.get("split") == "train"]
    val_ex = [e for e in all_ex if e.get("split") == "val"]
    test_ex = [e for e in all_ex if e.get("split") == "test"]
    train_ids = [e["example_id"] for e in train_ex]
    id_to_ex: dict[str, dict[str, Any]] = {e["example_id"]: e for e in train_ex}

    cfg = merge_train_cfg(default_train_cfg(model_family), train_cfg)
    cfg["model_family"] = normalize_model_family(cfg.get("model_family") or model_family)
    cfg.setdefault("model", {})
    cfg["model"]["model_family"] = cfg["model_family"]
    cfg["train"]["epochs"] = train_epochs_per_round

    git_sha = _git_sha()
    ds_hash = _file_sha256(examples_path)

    manifest: dict[str, Any] = {
        "experiment_run_id": eid,
        "dataset_version_id": dataset_version_id,
        "examples_jsonl": str(examples_path.resolve()),
        "examples_sha256": ds_hash,
        "random_seed": random_seed,
        "model_family": cfg["model_family"],
        "train_config": cfg,
        "replay_training_mode": replay_training_mode,
        "acquisition_mode": acquisition_mode,
        "policy": pol.to_json_dict(),
        "git_sha": git_sha,
        "created_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "split_ids": {
            "train_n": len(train_ex),
            "val_n": len(val_ex),
            "test_n": len(test_ex),
        },
    }
    (out / "experiment_manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    (out / "policy_config.json").write_text(json.dumps(pol.to_json_dict(), indent=2, default=str), encoding="utf-8")

    exp_cfg = {
        "experiment_run_id": eid,
        "dataset_version_id": dataset_version_id,
        "model_family": cfg["model_family"],
        "acquisition_mode": acquisition_mode,
        "replay_training_mode": replay_training_mode,
        "initial_seed_size": initial_seed_size,
        "acquisition_batch_size": acquisition_batch_size,
        "max_rounds": max_rounds,
        "max_labeled_total": max_labeled_total,
        "random_seed": random_seed,
        "git_sha": git_sha,
        "train_epochs_per_round": train_epochs_per_round,
    }
    (out / "experiment_config.json").write_text(json.dumps(exp_cfg, indent=2), encoding="utf-8")
    ref = {
        "dataset_version_id": dataset_version_id,
        "examples_jsonl": str(examples_path.resolve()),
        "manifest_json": str(paths["manifest_json"].resolve()) if paths["manifest_json"].is_file() else None,
        "dataset_hash_source": "phase1_frozen_canonical",
    }
    (out / "dataset_version_ref.json").write_text(json.dumps(ref, indent=2), encoding="utf-8")

    rng = random.Random(random_seed)
    torch.manual_seed(random_seed)

    unlabeled = set(train_ids)
    if len(unlabeled) < initial_seed_size:
        raise ValueError("Not enough train examples for initial seed")
    seed_ids = sample_random(list(unlabeled), initial_seed_size, rng)
    labeled: set[str] = set(seed_ids)
    unlabeled -= labeled

    round_metrics_path = out / "round_metrics.jsonl"
    acq_path = out / "acquisition_log.jsonl"
    per_round_csv = out / "round_metrics.csv"
    round_metrics_path.write_text("", encoding="utf-8")
    acq_path.write_text("", encoding="utf-8")

    val_jsonl = out / "_val_holdout.jsonl"
    examples_to_legacy_jsonl_path(val_ex, val_jsonl)
    test_jsonl = out / "_test_holdout.jsonl"
    if test_ex:
        examples_to_legacy_jsonl_path(test_ex, test_jsonl)

    device = torch.device(cfg["train"].get("device", "cpu"))
    summary_rounds: list[dict[str, Any]] = []

    # Rolling instability: example_id -> (boundary history, attribute history)
    unc_history: dict[str, tuple[list[float], list[float]]] = {}

    prev_ckpt: Path | None = None
    cumulative_delta_val = 0.0
    cumulative_cost = 0.0

    csv_header = (
        "round,labeled_count,val_loss_before,val_loss_after,delta_val_loss,"
        "batch_total_cost,cumulative_cost,delta_val_per_cost,cumulative_delta_val_loss_per_cumulative_cost\n"
    )
    per_round_csv.write_text(csv_header, encoding="utf-8")

    for rnd in range(max_rounds):
        if len(labeled) >= max_labeled_total:
            break

        round_dir = out / f"round_{rnd:04d}"
        round_dir.mkdir(parents=True, exist_ok=True)
        labeled_rows = [e for e in train_ex if e["example_id"] in labeled]
        labeled_jsonl = round_dir / "labeled_samples.jsonl"
        examples_to_legacy_jsonl_path(labeled_rows, labeled_jsonl)

        labeled_texts = [str(e.get("text") or "") for e in labeled_rows]
        counts = build_unit_counts_from_texts(labeled_texts)

        val_loss_before: float | None = None
        if prev_ckpt is not None and prev_ckpt.is_file():
            ckpt_pre = load_checkpoint(prev_ckpt, map_location=device)
            model_pre = build_model(ckpt_pre["config"])
            model_pre.load_state_dict(ckpt_pre["model_state"])
            model_pre.to(device)
            model_pre.eval()
            val_loss_before = _eval_val_multitask_loss(model_pre, val_jsonl, cfg, device)

        cfg_round = json.loads(json.dumps(cfg))
        cfg_round.setdefault("train", {})["seed"] = int(random_seed) * 100_000 + rnd
        if replay_training_mode == "warm_start" and prev_ckpt is not None and prev_ckpt.is_file():
            cfg_round["train"]["init_checkpoint_path"] = str(prev_ckpt.resolve())
        else:
            cfg_round["train"].pop("init_checkpoint_path", None)

        t0 = time.perf_counter()
        run_training(samples_jsonl=labeled_jsonl, out_dir=round_dir, cfg=cfg_round, epochs=None)
        train_time = time.perf_counter() - t0

        ckpt_p = round_dir / "letter_sequence.pt"
        prev_ckpt = ckpt_p
        ckpt = load_checkpoint(ckpt_p, map_location=device)
        model = build_model(ckpt["config"])
        model.load_state_dict(ckpt["model_state"])
        model.to(device)
        model.eval()

        val_loss_after = _eval_val_multitask_loss(model, val_jsonl, cfg, device)
        if val_loss_after is None:
            val_loss_after = float("nan")

        if val_ex:
            val_loader = DataLoader(
                LetterSequenceDataset(val_jsonl, split="val"),
                batch_size=cfg["train"].get("batch_size", 8),
                shuffle=False,
                collate_fn=collate_letter_batch,
            )
            t1 = time.perf_counter()
            ext = evaluate_extended_metrics(model, val_loader, device)
            eval_time = time.perf_counter() - t1
        else:
            ext = {"note": "no_val_split_in_frozen_data"}
            eval_time = 0.0

        cost = compute_cost_metrics(ckpt_p, model)
        lat = measure_inference_latency_ms(ckpt_p)

        delta_val: float | None = None
        if val_loss_before is not None and val_loss_after is not None:
            if not math.isnan(float(val_loss_after)) and not math.isnan(float(val_loss_before)):
                delta_val = float(val_loss_before) - float(val_loss_after)

        row_base: dict[str, Any] = {
            "round": rnd,
            "labeled_count": len(labeled),
            "train_time_sec": train_time,
            "eval_time_sec": eval_time,
            "metrics": ext,
            "val_multitask_loss": val_loss_after,
            "val_loss_before": val_loss_before,
            "val_loss_after": val_loss_after,
            "delta_val_loss": delta_val,
            "cost": {**cost, "latency": lat},
            "checkpoint": str(ckpt_p.resolve()),
        }

        k = min(acquisition_batch_size, max_labeled_total - len(labeled), len(unlabeled))
        acq_time = 0.0
        picked: list[str] = []
        batch_total_cost = 0.0
        feature_summary: dict[str, Any] = {}

        if k > 0 and acquisition_mode == "random":
            ta = time.perf_counter()
            picked = sample_random(list(unlabeled), k, rng)
            acq_time = time.perf_counter() - ta
            for pid in picked:
                ex = id_to_ex[pid]
                batch_total_cost += estimate_label_cost(
                    str(ex.get("text") or ""),
                    mode=pol.cost_mode,
                    labeled_char_counts=counts["char"],
                )
        elif k > 0 and acquisition_mode == "legacy_boundary_only":
            ta = time.perf_counter()
            uex = [id_to_ex[i] for i in unlabeled]
            tmp_u = round_dir / "unlabeled_pool.jsonl"
            examples_to_legacy_jsonl_path(uex, tmp_u)
            u_ds = LetterSequenceDataset(tmp_u, split=None)
            u_ld = DataLoader(
                u_ds,
                batch_size=cfg["train"].get("batch_size", 8),
                shuffle=False,
                collate_fn=collate_letter_batch,
            )
            scores_list: list[tuple[str, float]] = []
            pos = 0
            with torch.no_grad():
                for batch in u_ld:
                    sc = uncertainty_scores_batch(model, batch, device)
                    bs = sc.shape[0]
                    for j in range(bs):
                        if pos + j < len(uex):
                            scores_list.append((uex[pos + j]["example_id"], float(sc[j].item())))
                    pos += bs
            picked = sample_topk(scores_list, k)
            acq_time = time.perf_counter() - ta
            for pid in picked:
                ex = id_to_ex[pid]
                batch_total_cost += estimate_label_cost(
                    str(ex.get("text") or ""),
                    mode=pol.cost_mode,
                    labeled_char_counts=counts["char"],
                )
        elif k > 0 and acquisition_mode == "hybrid":
            ta = time.perf_counter()
            uex = [id_to_ex[i] for i in unlabeled]
            texts = [str(e.get("text") or "") for e in uex]
            pairs = batch_uncertainty_for_texts(model, texts, device=device, batch_size=cfg["train"].get("batch_size", 8))
            scorer_rows: list[dict[str, Any]] = []
            for ex, (bu, au) in zip(uex, pairs):
                eid = ex["example_id"]
                text = str(ex.get("text") or "")
                nov = segment_novelty_score(text, counts)
                cov = coverage_gain_score(text, counts)
                bh, ah = unc_history.get(eid, ([], []))
                inst = instability_score_replay_cold(bh, ah)
                scorer_rows.append(
                    {
                        "stimulus_id": eid,
                        "text": text,
                        "boundary_uncertainty": float(bu),
                        "segment_attribute_uncertainty": float(au),
                        "segment_novelty": float(nov),
                        "coverage_gain": float(cov),
                        "instability": float(inst),
                    }
                )
            scored = score_hybrid_candidates(scorer_rows, weights=weights, norm=norm_cfg)
            if pol.enable_cost_aware_scoring:
                rc = [
                    estimate_label_cost(
                        str(r["text"]),
                        mode=pol.cost_mode,
                        labeled_char_counts=counts["char"],
                    )
                    for r in scorer_rows
                ]
                scored = apply_cost_penalty(scored, raw_costs=rc, lambda_cost=pol.lambda_cost, norm=norm_cfg)
            if pol.enable_diversity_rerank:
                if pol.similarity_backend == "embedding":
                    raise ValueError("embedding similarity not supported in replay v1")
                final_scored = rerank_batch_with_diversity(
                    scored,
                    k=k,
                    top_m=pol.diversity_top_m,
                    lambda_redundancy=pol.lambda_redundancy,
                    similarity_backend=pol.similarity_backend,  # type: ignore[arg-type]
                )
            else:
                final_scored = sorted(scored, key=lambda r: -float(r["score"]))[:k]
            picked = [str(s["stimulus_id"]) for s in final_scored]
            acq_time = time.perf_counter() - ta
            for pid in picked:
                ex = id_to_ex[pid]
                batch_total_cost += estimate_label_cost(
                    str(ex.get("text") or ""),
                    mode=pol.cost_mode,
                    labeled_char_counts=counts["char"],
                )
            feature_summary = {
                "n_candidates": len(scorer_rows),
                "mean_score": sum(float(s["score"]) for s in scored) / max(len(scored), 1),
            }

            # Update rolling histories for all candidates in U
            for ex, (bu, au) in zip(uex, pairs):
                eid = ex["example_id"]
                bh, ah = unc_history.get(eid, ([], []))
                bh = bh + [float(bu)]
                ah = ah + [float(au)]
                unc_history[eid] = (bh[-32:], ah[-32:])

        row_base["acquisition_time_sec"] = acq_time
        row_base["acquired_ids"] = picked
        row_base["acquisition_feature_summary"] = feature_summary
        row_base["batch_total_estimated_cost"] = batch_total_cost

        cumulative_cost += batch_total_cost
        if delta_val is not None:
            cumulative_delta_val += float(delta_val)
        primary_objective = cumulative_delta_val / cumulative_cost if cumulative_cost > 1e-12 else None
        row_base["cumulative_delta_val_loss"] = cumulative_delta_val
        row_base["cumulative_labeling_cost"] = cumulative_cost
        row_base["cumulative_delta_val_loss_per_cumulative_cost"] = primary_objective

        summary_rounds.append(row_base)
        with round_metrics_path.open("a", encoding="utf-8") as fm:
            fm.write(json.dumps(row_base, default=str) + "\n")

        dvpc = ""
        if cumulative_cost > 0 and row_base.get("delta_val_loss") is not None:
            dvpc = str(float(row_base["delta_val_loss"]) / batch_total_cost) if batch_total_cost > 0 else ""
        line = (
            f"{rnd},{len(labeled)},{val_loss_before},{val_loss_after},{row_base.get('delta_val_loss')},"
            f"{batch_total_cost},{cumulative_cost},{dvpc},{primary_objective}\n"
        )
        with per_round_csv.open("a", encoding="utf-8") as fc:
            fc.write(line)

        if k > 0:
            with acq_path.open("a", encoding="utf-8") as fa:
                for ex_id in picked:
                    fa.write(
                        json.dumps(
                            {
                                "round_idx": rnd,
                                "example_id": ex_id,
                                "selected": True,
                                "acquisition_mode": acquisition_mode,
                            },
                            default=str,
                        )
                        + "\n"
                    )
            labeled.update(picked)
            unlabeled -= set(picked)

        if len(labeled) >= max_labeled_total or k <= 0:
            break

    test_eval: dict[str, Any] | None = None
    if test_ex and prev_ckpt and prev_ckpt.is_file():
        ckpt = load_checkpoint(prev_ckpt, map_location=device)
        m = build_model(ckpt["config"])
        m.load_state_dict(ckpt["model_state"])
        m.to(device)
        m.eval()
        tl = DataLoader(
            LetterSequenceDataset(test_jsonl, split="test"),
            batch_size=cfg["train"].get("batch_size", 8),
            shuffle=False,
            collate_fn=collate_letter_batch,
        )
        test_eval = evaluate_extended_metrics(m, tl, device)

    final_summary = {
        "experiment_run_id": eid,
        "dataset_version_id": dataset_version_id,
        "model_family": cfg["model_family"],
        "acquisition_mode": acquisition_mode,
        "replay_training_mode": replay_training_mode,
        "random_seed": random_seed,
        "git_sha": git_sha,
        "rounds_completed": len(summary_rounds),
        "final_labeled_count": len(labeled),
        "rounds": summary_rounds,
        "test_metrics_one_shot": test_eval,
        "primary_objective_cumulative_delta_val_per_cost": (
            cumulative_delta_val / cumulative_cost if cumulative_cost > 1e-12 else None
        ),
    }
    (out / "final_summary.json").write_text(json.dumps(final_summary, indent=2, default=str), encoding="utf-8")
    return final_summary
