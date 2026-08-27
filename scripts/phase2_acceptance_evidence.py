#!/usr/bin/env python3
"""
Phase 2 acceptance evidence runner: prints structured proof blocks to stdout.
Also writes under artifacts/acceptance/ (datasets, checkpoints, DB, experiment dirs).

Usage (from repo root):
  PYTHONPATH=packages/letter_sequence python scripts/phase2_acceptance_evidence.py
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _ensure_paths() -> None:
    ls = REPO / "packages" / "letter_sequence"
    if str(ls) not in sys.path:
        sys.path.insert(0, str(ls))


def _write_min_dataset(dataset_version_id: str) -> None:
    from letter_sequence.data.export_dataset import (
        PRODUCT_LINE,
        TASK_NAME,
        CANONICAL_SCHEMA,
        assign_split,
        compute_dataset_hash,
    )

    base = REPO / "artifacts" / "datasets" / dataset_version_id
    base.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    words = [
        "a",
        "at",
        "cat",
        "dog",
        "bird",
        "hello",
        "world",
        "testing",
        "python",
        "glyph",
        "sequence",
        "model",
        "train",
        "val",
        "split",
        "batch",
        "epoch",
        "loss",
        "metric",
        "round",
        "sample",
        "extra1",
        "extra2",
        "extra3",
        "extra4",
        "extra5",
        "extra6",
        "extra7",
        "extra8",
    ]
    split_seed = 42
    for i, w in enumerate(words):
        eid = f"acc_min_{i:04d}_{hashlib.sha256(w.encode()).hexdigest()[:8]}"
        sp = assign_split(eid, split_seed, train_ratio=0.85, val_ratio=0.15)
        L = len(w)
        lab = [[50.0, 0.0, 0.0]] * L
        rows.append(
            {
                "example_id": eid,
                "product_line": PRODUCT_LINE,
                "task_name": TASK_NAME,
                "schema_version": CANONICAL_SCHEMA,
                "word_text": w,
                "letters": list(w),
                "targets": {
                    "lab": lab,
                    "prominence": [0.5] * L,
                    "spread": [0.5] * L,
                    "boundary": [0.5] * max(0, L - 1),
                },
                "source": {
                    "stimulus_id": f"s{i}",
                    "annotation_id": f"a{i}",
                    "feedback_id": None,
                    "feedback_applied": False,
                },
                "split": sp,
            }
        )
    h = compute_dataset_hash(rows)
    ex_path = base / "examples.jsonl"
    with ex_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (base / "manifest.json").write_text(
        json.dumps(
            {
                "dataset_version_id": dataset_version_id,
                "dataset_hash": h,
                "n_examples": len(rows),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _section(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def evidence_old_bilstm_no_family() -> None:
    _ensure_paths()
    import torch
    from letter_sequence.data.sequence_dataset import collate_letter_batch, forward_letter_batch
    from letter_sequence.eval.evaluate_snapshot import evaluate_snapshot
    from letter_sequence.models.model_factory import normalize_model_family
    from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
    from letter_sequence.training.io import load_checkpoint
    from letter_sequence.training.train_loop import run_training

    acc_dir = REPO / "artifacts" / "acceptance"
    acc_dir.mkdir(parents=True, exist_ok=True)
    ds_id = "acceptance_al_min_v1"
    _write_min_dataset(ds_id)
    samples = REPO / "artifacts" / "datasets" / ds_id / "examples.jsonl"
    # legacy jsonl with splits for train_loop
    from letter_sequence.data.export_dataset import canonical_to_v2_legacy
    from letter_sequence.data.experiment_io import load_canonical_examples

    canon = load_canonical_examples(samples)
    train_only = REPO / "artifacts" / "acceptance" / "train_only.jsonl"
    with train_only.open("w", encoding="utf-8") as f:
        for c in canon:
            if c.get("split") == "train":
                f.write(json.dumps(canonical_to_v2_legacy(c), ensure_ascii=False) + "\n")

    out_train = acc_dir / "train_bilstm_baseline"
    if out_train.is_dir():
        shutil.rmtree(out_train)
    out_train.mkdir(parents=True)
    from letter_sequence.al.simulate_active_learning import _default_train_cfg, _merge_train_cfg

    cfg = _merge_train_cfg(
        _default_train_cfg("bilstm"),
        {"train": {"epochs": 1, "batch_size": 8, "device": "cpu"}},
    )
    run_training(samples_jsonl=train_only, out_dir=out_train, cfg=cfg, epochs=1)
    src_ckpt = out_train / "letter_sequence.pt"
    ckpt = load_checkpoint(src_ckpt, map_location="cpu")
    raw_cfg = dict(ckpt["config"])
    raw_cfg.pop("model_family", None)
    old_path = acc_dir / "old_bilstm_no_model_family.pt"
    torch.save(
        {"model_state": ckpt["model_state"], "config": raw_cfg, "epoch": ckpt.get("epoch", 0)},
        old_path,
    )

    fam = normalize_model_family(raw_cfg.get("model_family"))
    print(f"normalize_model_family(config.get('model_family')) -> {fam!r}  (fallback: missing/empty -> bilstm)")

    # predict_word-equivalent forward
    w = "cat"
    letters = list(w.lower())
    L = len(letters)
    row = {
        "letters": letters,
        "target_lab": [[0.0, 0.0, 0.0]] * L,
        "target_prominence": [0.0] * L,
        "target_spread": [0.0] * L,
        "target_boundary": [0.0] * max(0, L - 1),
    }
    batch = collate_letter_batch([row])
    ck2 = load_checkpoint(old_path, map_location="cpu")
    model = letter_sequence_model_from_config(ck2.get("config") or {})
    model.load_state_dict(ck2["model_state"])
    model.eval()
    import torch as T

    for k in batch:
        if isinstance(batch[k], T.Tensor):
            batch[k] = batch[k].to("cpu")
    with T.no_grad():
        pred = forward_letter_batch(model, batch)
    ok_pred = pred["pred_lab"].shape[1] == L
    print(f"predict_word-equivalent forward: {'OK' if ok_pred else 'FAIL'} (letter_sequence_model_from_config -> build_model -> normalize -> bilstm)")

    # val legacy slice
    val_tmp = acc_dir / "val_slice.jsonl"
    with val_tmp.open("w", encoding="utf-8") as f:
        for c in canon:
            if c.get("split") == "val":
                f.write(json.dumps(canonical_to_v2_legacy(c), ensure_ascii=False) + "\n")
    ev = evaluate_snapshot(old_path, val_tmp, split="val", batch_size=8, device="cpu")
    ok_ev = ev.get("n_examples", 0) == 0 or "mae_lab" in ev
    print(f"evaluate_snapshot: {'OK' if ok_ev else 'FAIL'} keys={list(ev.keys())[:8]}")
    print(f"artifact (old checkpoint): {old_path}")


def evidence_model_family_triple() -> None:
    _ensure_paths()
    os.environ["DATABASE_URL"] = f"sqlite:///{REPO / 'artifacts' / 'acceptance' / 'evidence.db'}"
    # Import after env
    sys.path.insert(0, str(REPO / "apps" / "api"))
    from sqlalchemy.orm import Session

    from app.db import Base, engine, SessionLocal
    from app.models.training_run import TrainingRun
    from app.services.model_snapshot_service import create_model_snapshot

    acc = REPO / "artifacts" / "acceptance"
    acc.mkdir(parents=True, exist_ok=True)
    from letter_sequence.data.experiment_io import load_canonical_examples
    from letter_sequence.data.export_dataset import canonical_to_v2_legacy
    from letter_sequence.training.io import load_checkpoint
    from letter_sequence.training.train_loop import run_training
    from letter_sequence.al.simulate_active_learning import _default_train_cfg, _merge_train_cfg

    samples = REPO / "artifacts" / "datasets" / "acceptance_al_min_v1" / "examples.jsonl"
    canon = load_canonical_examples(samples)
    train_only = acc / "train_only_triple.jsonl"
    with train_only.open("w", encoding="utf-8") as f:
        for c in canon:
            if c.get("split") == "train":
                f.write(json.dumps(canonical_to_v2_legacy(c), ensure_ascii=False) + "\n")

    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        for fam in ("mlp", "bilstm", "transformer_encoder"):
            out_d = acc / f"train_{fam}_triple"
            if out_d.is_dir():
                shutil.rmtree(out_d)
            out_d.mkdir(parents=True)
            cfg = _merge_train_cfg(
                _default_train_cfg(fam),
                {"train": {"epochs": 1, "batch_size": 8, "device": "cpu"}},
            )
            run_training(samples_jsonl=train_only, out_dir=out_d, cfg=cfg, epochs=1)
            ckpt_path = out_d / "letter_sequence.pt"
            ck = load_checkpoint(ckpt_path, map_location="cpu")
            mf_ck = (ck.get("config") or {}).get("model_family")
            tr = TrainingRun(
                id=str(uuid.uuid4()),
                status="finished",
                mode="letter_sequence",
                config_json=json.dumps(ck["config"], ensure_ascii=False),
                out_dir=str(out_d.resolve()),
                best_val_loss=0.1,
                n_samples=len(canon),
                n_unique_words=10,
            )
            db.add(tr)
            db.flush()
            snap = create_model_snapshot(
                db,
                tr,
                checkpoint_path=ckpt_path,
                dataset_version_id=None,
                git_sha="acceptance",
                model_family=mf_ck,
                metrics_json={"model_family": mf_ck},
            )
            db.flush()
            man_path = REPO / "artifacts" / "models" / snap.id / "manifest.json"
            manifest = json.loads(man_path.read_text(encoding="utf-8"))
            cfg_tr = json.loads(tr.config_json)
            print(f"--- family={fam} snapshot_id={snap.id}")
            print(f"  model_snapshot.model_family (DB): {snap.model_family!r}")
            print(f"  config_json.model_family:         {cfg_tr.get('model_family')!r}")
            print(f"  manifest.json model_family:       {manifest.get('model_family')!r}")
            ok = snap.model_family == cfg_tr.get("model_family") == manifest.get("model_family") == fam
            print(f"  triple_match (explicit, not DEFAULT only): {ok}")
        db.commit()
    finally:
        db.close()


def evidence_determinism() -> None:
    _ensure_paths()
    from letter_sequence.al.simulate_active_learning import run_active_learning_simulation

    ds_id = "acceptance_al_min_v1"
    eid = "det_proof_fixed_id"
    acc = REPO / "artifacts" / "acceptance"
    out = REPO / "artifacts" / "experiments" / eid

    def strip_times(obj: dict) -> dict:
        out = {}
        for k, v in obj.items():
            if k.endswith("_time_sec") or k == "cost":
                continue
            if k == "rounds":
                out[k] = [strip_times(r) if isinstance(r, dict) else r for r in v]
                continue
            out[k] = v
        return out

    def run_once() -> tuple[dict, str, str]:
        if out.is_dir():
            shutil.rmtree(out)
        run_active_learning_simulation(
            dataset_version_id=ds_id,
            model_family="mlp",
            sampling_strategy="random",
            experiment_run_id=eid,
            initial_seed_size=4,
            acquisition_batch_size=2,
            max_rounds=3,
            max_labeled_total=8,
            random_seed=999,
            train_epochs_per_round=1,
            train_cfg={"train": {"epochs": 1, "batch_size": 4, "device": "cpu"}},
        )
        rm = (out / "round_metrics.jsonl").read_text(encoding="utf-8")
        fs = json.loads((out / "final_summary.json").read_text(encoding="utf-8"))
        return fs, rm, strip_times(fs).__repr__()

    fs1, rm1, _ = run_once()
    shutil.copy(out / "round_metrics.jsonl", acc / "det_round_metrics_run1.jsonl")
    shutil.copy(out / "final_summary.json", acc / "det_final_summary_run1.json")
    fs2, rm2, _ = run_once()
    # Compare excluding timing fields in JSON lines
    def norm_rm(s: str) -> str:
        lines = []
        for line in s.strip().split("\n"):
            if not line.strip():
                continue
            o = json.loads(line)
            o.pop("train_time_sec", None)
            o.pop("eval_time_sec", None)
            o.pop("acquisition_time_sec", None)
            if "cost" in o:
                o.pop("cost", None)
            lines.append(json.dumps(o, sort_keys=True, default=str))
        return "\n".join(lines)

    same_rm = norm_rm(rm1) == norm_rm(rm2)
    s1 = strip_times(fs1)
    s2 = strip_times(fs2)
    same_fs = json.dumps(s1, sort_keys=True, default=str) == json.dumps(s2, sort_keys=True, default=str)
    print(f"round_metrics (normalized, no timings/cost): match={same_rm}")
    print(f"final_summary (normalized, no timings/cost in rounds): match={same_fs}")
    print(f"paths: {out / 'round_metrics.jsonl'}, {out / 'final_summary.json'}")


def evidence_smoke() -> None:
    _ensure_paths()
    from letter_sequence.al.simulate_active_learning import run_active_learning_simulation

    ds_id = "acceptance_al_min_v1"
    acc = REPO / "artifacts" / "acceptance"

    def one(name: str, fam: str, strat: str) -> None:
        eid = f"smoke_{name}_{uuid.uuid4().hex[:8]}"
        run_active_learning_simulation(
            dataset_version_id=ds_id,
            model_family=fam,
            sampling_strategy=strat,
            experiment_run_id=eid,
            initial_seed_size=4,
            acquisition_batch_size=2,
            max_rounds=3,
            max_labeled_total=10,
            random_seed=42,
            train_epochs_per_round=1,
            train_cfg={"train": {"epochs": 1, "batch_size": 4, "device": "cpu"}},
        )
        out = REPO / "artifacts" / "experiments" / eid
        fs = json.loads((out / "final_summary.json").read_text(encoding="utf-8"))
        print(f"--- {strat} + {fam}")
        print(f"  dir: {out}")
        print(
            "  final_summary keys: rounds_completed, final_labeled_count, model_family, sampling_strategy, random_seed"
        )
        print(f"  rounds_completed: {fs.get('rounds_completed')}")
        print(f"  final_labeled_count: {fs.get('final_labeled_count')}")
        print(f"  model_family: {fs.get('model_family')}")
        print(f"  sampling_strategy: {fs.get('sampling_strategy')}")

    one("random_mlp", "mlp", "random")
    one("uncertainty_bilstm", "bilstm", "uncertainty")


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--only",
        choices=("1", "2", "3", "4", "5", "6", "all"),
        default="all",
        help="Run a single evidence block (default: all).",
    )
    args = ap.parse_args()
    only = args.only

    def want(n: str) -> bool:
        return only == "all" or only == n

    _ensure_paths()
    if want("1"):
        _section("1) Old BiLSTM checkpoint (no model_family in config)")
        evidence_old_bilstm_no_family()

    if want("2"):
        _section("2) model_family triple (DB / config_json / manifest.json)")
        evidence_model_family_triple()

    if want("3"):
        _section("3) acquisition_log.jsonl sample (uncertainty) — see smoke artifact")
        ds_id = "acceptance_al_min_v1"
        _write_min_dataset(ds_id)
        from letter_sequence.al.simulate_active_learning import run_active_learning_simulation

        eid_acq = "smoke_acq_log_demo"
        out = REPO / "artifacts" / "experiments" / eid_acq
        if out.is_dir():
            shutil.rmtree(out)
        run_active_learning_simulation(
            dataset_version_id=ds_id,
            model_family="bilstm",
            sampling_strategy="uncertainty",
            experiment_run_id=eid_acq,
            initial_seed_size=4,
            acquisition_batch_size=2,
            max_rounds=2,
            max_labeled_total=8,
            random_seed=7,
            train_epochs_per_round=1,
            train_cfg={"train": {"epochs": 1, "batch_size": 4, "device": "cpu"}},
        )
        p = out / "acquisition_log.jsonl"
        lines = [json.loads(x) for x in p.read_text(encoding="utf-8").strip().split("\n") if x.strip()]
        print(f"artifact: {p}")
        if lines:
            print("first line sample:")
            print(json.dumps(lines[0], indent=2, ensure_ascii=False))

    if want("4"):
        _section("4) Latency protocol (measure_inference_latency_ms)")
        from letter_sequence.eval.experiment_metrics import (
            LATENCY_BATCH_SIZE,
            LATENCY_DEVICE,
            LATENCY_REPEATS,
            LATENCY_WARMUP,
            LATENCY_WORDS,
        )

        print(f"LATENCY_DEVICE={LATENCY_DEVICE!r}")
        print(f"LATENCY_BATCH_SIZE={LATENCY_BATCH_SIZE}")
        print(f"LATENCY_WARMUP={LATENCY_WARMUP}")
        print(f"LATENCY_REPEATS={LATENCY_REPEATS}")
        print(f"LATENCY_WORDS (synthetic batch)={LATENCY_WORDS!r}")
        print("Sample selection: fixed rotating words fill batch_size rows via collate_letter_batch (not dataset-driven).")

    if want("5"):
        _section("5) AL determinism (same config + seed, fixed experiment_run_id)")
        evidence_determinism()

    if want("6"):
        _section("6) Smoke: random+mlp and uncertainty+bilstm")
        evidence_smoke()


if __name__ == "__main__":
    main()
