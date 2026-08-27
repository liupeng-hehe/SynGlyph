#!/usr/bin/env python3
"""Train letter-sequence model (any family); thin CLI over letter_sequence.training.train_loop."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.training.train_loop import run_training  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--samples-jsonl", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=None)
    args = ap.parse_args()

    cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    run_training(
        samples_jsonl=args.samples_jsonl,
        out_dir=args.out_dir,
        cfg=cfg,
        epochs=args.epochs,
    )
    print(f"Done. Checkpoint: {args.out_dir / 'letter_sequence.pt'}")


if __name__ == "__main__":
    main()
