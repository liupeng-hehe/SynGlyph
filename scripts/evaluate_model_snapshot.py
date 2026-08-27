#!/usr/bin/env python3
"""Evaluate a saved model snapshot on a frozen dataset split (snapshot-first)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))
os.environ.setdefault("PYTHONPATH", str(_REPO / "packages" / "letter_sequence"))

from app.db import SessionLocal  # noqa: E402
from app.models.model_snapshot import ModelSnapshot  # noqa: E402
from app.services.artifact_paths import dataset_version_dir  # noqa: E402
from app.services.letter_sequence_evaluate import run_evaluation_for_snapshot  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-snapshot-id", required=True)
    ap.add_argument(
        "--dataset-version-id",
        required=True,
        help="Frozen dataset; uses letter_sequence_samples.jsonl under artifacts/datasets/<id>/",
    )
    ap.add_argument("--split", default="val", choices=("train", "val", "test"))
    ap.add_argument(
        "--checkpoint-path",
        type=Path,
        default=None,
        help="Debug only: evaluate this file instead of snapshot.checkpoint_uri",
    )
    ap.add_argument("--no-db", action="store_true", help="Print metrics only; do not write ml_evaluation_run")
    args = ap.parse_args()

    samples = dataset_version_dir(args.dataset_version_id) / "letter_sequence_samples.jsonl"
    if not samples.is_file():
        raise SystemExit(f"dataset jsonl not found: {samples}")

    from letter_sequence.eval.evaluate_snapshot import evaluate_snapshot  # noqa: E402

    if args.checkpoint_path is not None:
        m = evaluate_snapshot(args.checkpoint_path, samples, split=args.split)
        print(json.dumps(m, indent=2))
        return

    if args.no_db:
        db = SessionLocal()
        try:
            snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == args.model_snapshot_id).first()
            if not snap:
                raise SystemExit("snapshot not found")
            ckpt = Path(snap.checkpoint_uri).expanduser()
            if not ckpt.is_file():
                raise SystemExit(f"checkpoint missing: {ckpt}")
        finally:
            db.close()
        m = evaluate_snapshot(ckpt, samples, split=args.split)
        print(json.dumps(m, indent=2))
        return

    row = run_evaluation_for_snapshot(
        model_snapshot_id=args.model_snapshot_id,
        dataset_version_id=args.dataset_version_id,
        samples_jsonl=samples,
        split_name=args.split,
        eval_config={"split": args.split, "cli": True},
    )
    if row:
        print(row.id)
    else:
        raise SystemExit("eval failed (is torch / letter_sequence installed?)")


if __name__ == "__main__":
    main()
