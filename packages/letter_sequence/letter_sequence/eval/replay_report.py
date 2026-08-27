"""Summarize replay experiment outputs (JSONL/CSV) for policy comparison."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from statistics import mean, stdev
from typing import Any


def load_round_metrics_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.is_file():
        return rows
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def summarize_final_summary(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_policy_comparison_csv(
    rows: list[dict[str, Any]],
    out_csv: Path,
) -> None:
    """Each row: experiment_run_id, acquisition_mode, primary_objective, final_val_loss, seed, ..."""
    if not rows:
        return
    keys = list(rows[0].keys())
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def aggregate_across_seeds(
    metrics_per_seed: list[float],
) -> tuple[float | None, float | None]:
    if not metrics_per_seed:
        return None, None
    if len(metrics_per_seed) == 1:
        return float(metrics_per_seed[0]), 0.0
    return float(mean(metrics_per_seed)), float(stdev(metrics_per_seed))
