"""Logging and reproducibility helpers."""

from __future__ import annotations

import logging
import random
import sys
from typing import Optional

import numpy as np


def setup_logging(level: int = logging.INFO, name: Optional[str] = None) -> logging.Logger:
    """Configure root logging once and return a named logger."""
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        root.addHandler(handler)
    root.setLevel(level)
    return logging.getLogger(name or "colorrec")


def set_seed(seed: int) -> None:
    """Set random seeds for reproducibility (stdlib + numpy)."""
    random.seed(seed)
    np.random.seed(seed)
