"""Evaluate a saved checkpoint on a frozen JSONL split (snapshot-first eval)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

from letter_sequence.data.sequence_dataset import LetterSequenceDataset, collate_letter_batch
from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
from letter_sequence.training.io import load_checkpoint
from letter_sequence.training.metrics import compute_epoch_metrics


def evaluate_snapshot(
    checkpoint_path: Path | str,
    samples_jsonl: Path | str,
    *,
    split: str = "val",
    batch_size: int = 16,
    device: str | torch.device = "cpu",
) -> dict[str, Any]:
    """
    Load weights from ``checkpoint_path`` and run ``compute_epoch_metrics`` on the given split.

    ``split`` must match the ``split`` field in legacy v2 JSONL rows (train / val / test).
    """
    ckpt_path = Path(checkpoint_path)
    jsonl = Path(samples_jsonl)
    if not ckpt_path.is_file():
        raise FileNotFoundError(str(ckpt_path))
    if not jsonl.is_file():
        raise FileNotFoundError(str(jsonl))

    dev = torch.device(device)
    ckpt = load_checkpoint(ckpt_path, map_location=dev)
    cfg = ckpt.get("config") or {}
    model = letter_sequence_model_from_config(cfg)
    model.load_state_dict(ckpt["model_state"])
    model.to(dev)
    model.eval()

    ds = LetterSequenceDataset(jsonl, split=split)
    if len(ds) == 0:
        return {
            "split": split,
            "n_examples": 0,
            "error": "no_examples_for_split",
        }
    loader = DataLoader(ds, batch_size=batch_size, shuffle=False, collate_fn=collate_letter_batch)
    metrics = compute_epoch_metrics(model, loader, dev)
    metrics["split"] = split
    metrics["n_examples"] = len(ds)
    return metrics
