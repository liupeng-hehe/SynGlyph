#!/usr/bin/env python3
"""Freeze English letter-sequence dataset (default: stimulus raw-export path)."""

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
from app.services.letter_sequence_dataset_export import freeze_dataset_version  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Export ml_dataset_version + artifacts (default source_mode=stimulus)")
    ap.add_argument("--source-mode", default="stimulus", choices=("stimulus", "english_db", "mixed"))
    ap.add_argument("--dataset-id", default=None, help="Stimulus dataset id (omit for global fetch)")
    ap.add_argument("--split-seed", type=int, default=42)
    ap.add_argument("--train-ratio", type=float, default=0.8)
    ap.add_argument("--val-ratio", type=float, default=None, help="Default: (1-train)/2")
    ap.add_argument("--test-ratio", type=float, default=None, help="Default: (1-train)/2")
    ap.add_argument("--json", action="store_true", help="Print manifest JSON to stdout")
    args = ap.parse_args()

    tr = float(args.train_ratio)
    if args.val_ratio is not None and args.test_ratio is not None:
        vr, ter = float(args.val_ratio), float(args.test_ratio)
    else:
        rem = 1.0 - tr
        vr = rem / 2.0
        ter = rem / 2.0

    db = SessionLocal()
    try:
        dv = freeze_dataset_version(
            db,
            source_mode=args.source_mode,
            dataset_id=args.dataset_id,
            split_seed=args.split_seed,
            train_ratio=tr,
            val_ratio=vr,
            test_ratio=ter,
        )
        if args.json:
            print(json.dumps({"dataset_version_id": dv.id, "dataset_hash": dv.dataset_hash}, indent=2))
        else:
            print(dv.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()
