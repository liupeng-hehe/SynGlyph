"""Checkpoint loading compatible with PyTorch versions before ``weights_only``."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch


def load_checkpoint(path: Path | str, map_location: Any = "cpu") -> Any:
    try:
        return torch.load(path, map_location=map_location, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=map_location)
