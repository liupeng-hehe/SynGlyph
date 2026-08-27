#!/usr/bin/env python3
"""Run 2x3 (sampling x model_family) x seeds matrix; optional skip-existing."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.al.simulate_active_learning import run_active_learning_simulation  # noqa: E402
from letter_sequence.paths import default_artifacts_root  # noqa: E402


def _run_id(fam: str, strat: str, seed: int) -> str:
    return f"grid_{fam}_{strat}_s{seed}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset-version-id", required=True)
    ap.add_argument("--seeds", type=int, nargs="+", default=[42, 43, 44])
    ap.add_argument("--initial-seed-size", type=int, default=8)
    ap.add_argument("--acquisition-batch-size", type=int, default=4)
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--max-labeled-total", type=int, default=24)
    ap.add_argument("--train-epochs-per-round", type=int, default=2)
    ap.add_argument("--skip-existing", action="store_true", help="Skip if final_summary.json exists for run id")
    ap.add_argument("--grid-summary", type=Path, default=None, help="Write JSON summary of all runs")
    args = ap.parse_args()

    families = ("mlp", "bilstm", "transformer_encoder")
    strategies = ("random", "uncertainty")
    results: list[dict] = []

    for fam in families:
        for strat in strategies:
            for seed in args.seeds:
                eid = _run_id(fam, strat, seed)
                out = default_artifacts_root() / "experiments" / eid
                fin = out / "final_summary.json"
                if args.skip_existing and fin.is_file():
                    results.append({"experiment_run_id": eid, "status": "skipped"})
                    continue
                summary = run_active_learning_simulation(
                    dataset_version_id=args.dataset_version_id,
                    model_family=fam,
                    sampling_strategy=strat,
                    train_cfg=None,
                    experiment_run_id=eid,
                    initial_seed_size=args.initial_seed_size,
                    acquisition_batch_size=args.acquisition_batch_size,
                    max_rounds=args.rounds,
                    max_labeled_total=args.max_labeled_total,
                    random_seed=seed,
                    train_epochs_per_round=args.train_epochs_per_round,
                )
                results.append({"experiment_run_id": summary["experiment_run_id"], "status": "completed"})

    grid_path = args.grid_summary or (default_artifacts_root() / "experiments" / "grid_summary.json")
    grid_path.parent.mkdir(parents=True, exist_ok=True)
    grid_path.write_text(json.dumps({"runs": results}, indent=2), encoding="utf-8")
    print(str(grid_path))


if __name__ == "__main__":
    main()
