#!/usr/bin/env python3
"""Evaluate checkpoint on val split; print MAE and write JSON report."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.data.sequence_dataset import LetterSequenceDataset, collate_letter_batch  # noqa: E402
from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config  # noqa: E402
from letter_sequence.training.io import load_checkpoint  # noqa: E402
from letter_sequence.training.metrics import compute_epoch_metrics  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--samples-jsonl", type=Path, required=True)
    ap.add_argument("--split", default="val", choices=("train", "val"))
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--out-json", type=Path, default=None)
    args = ap.parse_args()

    ckpt = load_checkpoint(args.checkpoint, map_location="cpu")
    cfg = ckpt.get("config") or {}
    model = letter_sequence_model_from_config(cfg)
    model.load_state_dict(ckpt["model_state"])
    device = torch.device("cpu")
    model.to(device)

    ds = LetterSequenceDataset(args.samples_jsonl, split=args.split)
    loader = torch.utils.data.DataLoader(
        ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_letter_batch
    )
    metrics = compute_epoch_metrics(model, loader, device)
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_letter"}, indent=2))
    if args.out_json:
        args.out_json.write_text(json.dumps(metrics, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
