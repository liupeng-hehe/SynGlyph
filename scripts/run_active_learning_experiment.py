#!/usr/bin/env python3
"""Run one active learning simulation (in-process; no train subprocess)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.al.simulate_active_learning import run_active_learning_simulation  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset-version-id", required=True)
    ap.add_argument("--model-family", required=True, choices=("mlp", "bilstm", "transformer_encoder"))
    ap.add_argument("--sampling-strategy", required=True, choices=("random", "uncertainty"))
    ap.add_argument("--initial-seed-size", type=int, default=10)
    ap.add_argument("--acquisition-batch-size", type=int, default=5)
    ap.add_argument("--rounds", type=int, default=20)
    ap.add_argument("--max-labeled-total", type=int, default=100)
    ap.add_argument("--random-seed", type=int, default=42)
    ap.add_argument("--train-epochs-per-round", type=int, default=5)
    ap.add_argument("--experiment-run-id", default=None)
    ap.add_argument("--train-config", type=Path, default=None, help="Optional YAML override merged into default train cfg")
    args = ap.parse_args()

    train_cfg = None
    if args.train_config:
        import yaml

        train_cfg = yaml.safe_load(args.train_config.read_text(encoding="utf-8"))

    summary = run_active_learning_simulation(
        dataset_version_id=args.dataset_version_id,
        model_family=args.model_family,
        sampling_strategy=args.sampling_strategy,
        train_cfg=train_cfg,
        experiment_run_id=args.experiment_run_id,
        initial_seed_size=args.initial_seed_size,
        acquisition_batch_size=args.acquisition_batch_size,
        max_rounds=args.rounds,
        max_labeled_total=args.max_labeled_total,
        random_seed=args.random_seed,
        train_epochs_per_round=args.train_epochs_per_round,
    )
    print(json.dumps({"experiment_run_id": summary["experiment_run_id"]}, indent=2))


if __name__ == "__main__":
    main()
