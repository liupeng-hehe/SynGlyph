#!/usr/bin/env python3
"""Run inference on JSONL samples or a single word; write predictions JSONL."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
sys.path.insert(0, str(_PKG))

from letter_sequence.al.uncertainty import placeholder_uncertainty  # noqa: E402
from letter_sequence.data.sequence_dataset import (  # noqa: E402
    LetterSequenceDataset,
    collate_letter_batch,
    forward_letter_batch,
)
from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config  # noqa: E402
from letter_sequence.training.io import load_checkpoint  # noqa: E402


@torch.no_grad()
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--samples-jsonl", type=Path, required=True)
    ap.add_argument("--out-jsonl", type=Path, required=True)
    ap.add_argument("--batch-size", type=int, default=16)
    args = ap.parse_args()

    ckpt = load_checkpoint(args.checkpoint, map_location="cpu")
    cfg = ckpt.get("config") or {}
    model = letter_sequence_model_from_config(cfg)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    device = torch.device("cpu")

    ds = LetterSequenceDataset(args.samples_jsonl, split=None)
    loader = torch.utils.data.DataLoader(
        ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_letter_batch
    )

    rows_meta = ds.rows
    idx = 0
    args.out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with args.out_jsonl.open("w", encoding="utf-8") as out:
        for batch in loader:
            for k in batch:
                if isinstance(batch[k], torch.Tensor):
                    batch[k] = batch[k].to(device)
            pred = forward_letter_batch(model, batch)
            B = batch["input_ids"].shape[0]
            pl = pred["pred_lab"].cpu()
            pp = pred["pred_prominence"].cpu()
            ps = pred["pred_spread"].cpu()
            pb = pred["pred_boundary"].cpu()
            for b in range(B):
                meta = rows_meta[idx]
                idx += 1
                L = len(meta["letters"])
                row = {
                    "annotation_id": meta["annotation_id"],
                    "word_text": meta["word_text"],
                    "letters": meta["letters"],
                    "pred_lab": pl[b, :L].tolist(),
                    "pred_prominence": pp[b, :L].tolist(),
                    "pred_spread": ps[b, :L].tolist(),
                    "pred_boundary": pb[b, : max(0, L - 1)].tolist() if L > 1 else [],
                    "target_lab": meta.get("target_lab"),
                    "target_prominence": meta.get("target_prominence"),
                    "target_spread": meta.get("target_spread"),
                    "target_boundary": meta.get("target_boundary"),
                    "uncertainty": placeholder_uncertainty({}),
                }
                out.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
