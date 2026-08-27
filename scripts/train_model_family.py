#!/usr/bin/env python3
"""Train one model family on a frozen dataset version (thin CLI over train_loop)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.paths import dataset_version_dir  # noqa: E402
from letter_sequence.training.train_loop import run_training  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset-version-id", required=True)
    ap.add_argument("--model-family", required=True, choices=("mlp", "bilstm", "transformer_encoder"))
    ap.add_argument("--config", type=Path, required=True, help="YAML with model/train sections")
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=None)
    args = ap.parse_args()

    cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    cfg.setdefault("model", {})
    cfg["model_family"] = args.model_family
    cfg["model"]["model_family"] = args.model_family

    samples = dataset_version_dir(args.dataset_version_id) / "letter_sequence_samples.jsonl"
    if not samples.is_file():
        raise SystemExit(f"Missing frozen samples: {samples}")

    run_training(samples_jsonl=samples, out_dir=args.out_dir, cfg=cfg, epochs=args.epochs)
    print(args.out_dir / "letter_sequence.pt")


if __name__ == "__main__":
    main()
