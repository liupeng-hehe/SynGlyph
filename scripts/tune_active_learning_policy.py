#!/usr/bin/env python3
"""
Random-search policy tuning for offline replay (BiLSTM, fixed split, fixed recipe).

Primary objective (default): maximize cumulative_delta_val_loss / cumulative_cost from ``final_summary.json``.

Requires ``synglyph-letter-sequence`` on PYTHONPATH or installed editable.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

# Repo root: scripts/ -> parent
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT / "packages" / "letter_sequence") not in sys.path:
    sys.path.insert(0, str(_ROOT / "packages" / "letter_sequence"))

from letter_sequence.al.policy_config import AcquisitionPolicyConfig  # noqa: E402
from letter_sequence.al.replay import run_active_learning_replay  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Random-search AL policy tuning (replay)")
    p.add_argument("--dataset-version-id", required=True)
    p.add_argument("--model-family", default="bilstm")
    p.add_argument("--replay-training-mode", choices=("from_scratch", "warm_start"), default="from_scratch")
    p.add_argument("--trials", type=int, default=5)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--max-rounds", type=int, default=3)
    p.add_argument("--initial-seed-size", type=int, default=8)
    p.add_argument("--acquisition-batch-size", type=int, default=4)
    p.add_argument("--max-labeled-total", type=int, default=40)
    p.add_argument("--out-dir", type=Path, default=Path("artifacts/al_tuning"))
    args = p.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    results: list[dict[str, object]] = []

    for t in range(args.trials):
        pol = AcquisitionPolicyConfig(
            feature_logits={
                "boundary_uncertainty": rng.uniform(-1, 1),
                "segment_attribute_uncertainty": rng.uniform(-1, 1),
                "segment_novelty": rng.uniform(-1, 1),
                "coverage_gain": rng.uniform(-1, 1),
                "instability": rng.uniform(-1, 1),
            },
            lambda_cost=rng.uniform(0.0, 0.5),
            enable_cost_aware_scoring=rng.random() > 0.5,
            enable_diversity_rerank=rng.random() > 0.5,
        )
        summary = run_active_learning_replay(
            dataset_version_id=args.dataset_version_id,
            model_family=args.model_family,
            acquisition_mode="hybrid",
            replay_training_mode=args.replay_training_mode,
            policy=pol,
            random_seed=args.seed + t,
            initial_seed_size=args.initial_seed_size,
            acquisition_batch_size=args.acquisition_batch_size,
            max_rounds=args.max_rounds,
            max_labeled_total=args.max_labeled_total,
            train_epochs_per_round=2,
        )
        obj = summary.get("primary_objective_cumulative_delta_val_per_cost")
        results.append(
            {
                "trial": t,
                "objective": obj,
                "experiment_run_id": summary.get("experiment_run_id"),
                "policy": pol.to_json_dict(),
            }
        )

    results.sort(key=lambda r: (r["objective"] is None, -(r["objective"] or 0.0)))
    (args.out_dir / "tuning_results.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(json.dumps(results[:5], indent=2, default=str))


if __name__ == "__main__":
    main()
