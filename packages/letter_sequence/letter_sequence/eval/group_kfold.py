"""Group K-Fold cross-validation for small lab JSONL datasets."""

from __future__ import annotations

import json
import math
import random
import statistics
from pathlib import Path
from typing import Any

import yaml

from letter_sequence.eval.evaluate_snapshot import evaluate_snapshot
from letter_sequence.training.train_loop import run_training


def choose_k(n_groups: int) -> int | None:
    if n_groups < 10:
        return None
    if n_groups < 20:
        return 3
    return 5


def _composite(metrics: dict[str, Any]) -> float:
    return (
        0.5 * float(metrics.get("mae_lab") or 0.0)
        + 0.2 * float(metrics.get("mae_prominence") or 0.0)
        + 0.2 * float(metrics.get("mae_spread") or 0.0)
        + 0.1 * float(metrics.get("mae_boundary") or 0.0)
    )


def _load_rows(jsonl_path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _group_key(row: dict[str, Any]) -> str:
    return (row.get("word_text") or "").strip().lower() or str(row.get("stimulus_id") or row.get("example_id"))


def _write_fold_jsonl(rows: list[dict[str, Any]], path: Path, *, val_groups: set[str]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            g = _group_key(row)
            out = dict(row)
            out["split"] = "val" if g in val_groups else "train"
            f.write(json.dumps(out, ensure_ascii=False) + "\n")


def run_group_kfold(
    samples_jsonl: Path | str,
    out_dir: Path | str,
    cfg: dict[str, Any],
    *,
    cv_epochs: int = 8,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Run group K-fold CV by word_text. Writes ``kfold_report.json`` under out_dir.

    CV failure is captured in report; caller may continue with full train.
    """
    jsonl = Path(samples_jsonl)
    root = Path(out_dir)
    root.mkdir(parents=True, exist_ok=True)
    rows = _load_rows(jsonl)
    groups = sorted({_group_key(r) for r in rows if _group_key(r)})
    k = choose_k(len(groups))
    if k is None:
        report = {
            "status": "skipped",
            "reason": "insufficient_groups",
            "n_groups": len(groups),
            "k": None,
            "folds": [],
            "summary": {},
        }
        (root / "kfold_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report

    rng = random.Random(seed)
    shuffled = list(groups)
    rng.shuffle(shuffled)
    fold_groups: list[list[str]] = [[] for _ in range(k)]
    for i, g in enumerate(shuffled):
        fold_groups[i % k].append(g)

    folds: list[dict[str, Any]] = []
    metric_keys = ("mae_lab", "mae_prominence", "mae_spread", "mae_boundary", "composite")

    for fi, val_gs in enumerate(fold_groups):
        val_set = set(val_gs)
        fold_dir = root / f"cv_fold_{fi}"
        fold_dir.mkdir(parents=True, exist_ok=True)
        fold_jsonl = fold_dir / "letter_sequence_samples.jsonl"
        _write_fold_jsonl(rows, fold_jsonl, val_groups=val_set)
        fold_cfg = json.loads(json.dumps(cfg))
        fold_cfg.setdefault("train", {})["epochs"] = cv_epochs
        (fold_dir / "run_config.yaml").write_text(
            yaml.safe_dump(fold_cfg, sort_keys=False),
            encoding="utf-8",
        )
        fold_metrics: dict[str, Any] = {"fold": fi, "n_val_groups": len(val_set), "val_groups": sorted(val_set)}
        try:
            run_training(samples_jsonl=fold_jsonl, out_dir=fold_dir, cfg=fold_cfg, epochs=cv_epochs)
            ckpt = fold_dir / "letter_sequence.pt"
            ev = evaluate_snapshot(ckpt, fold_jsonl, split="val")
            fold_metrics.update({mk: ev.get(mk) for mk in metric_keys if mk != "composite"})
            fold_metrics["composite"] = _composite(ev)
            fold_metrics["n_val_examples"] = ev.get("n_examples", 0)
            fold_metrics["status"] = "ok"
        except Exception as e:
            fold_metrics["status"] = "failed"
            fold_metrics["error"] = str(e)[:500]
        folds.append(fold_metrics)

    ok_folds = [f for f in folds if f.get("status") == "ok"]
    summary: dict[str, Any] = {}
    if ok_folds:
        for mk in metric_keys:
            vals = [float(f[mk]) for f in ok_folds if mk in f and f[mk] is not None and not math.isnan(float(f[mk]))]
            if vals:
                summary[mk] = {
                    "mean": statistics.mean(vals),
                    "std": statistics.pstdev(vals) if len(vals) > 1 else 0.0,
                }

    report = {
        "status": "done" if ok_folds else "failed",
        "n_groups": len(groups),
        "k": k,
        "folds": folds,
        "summary": summary,
    }
    (root / "kfold_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
