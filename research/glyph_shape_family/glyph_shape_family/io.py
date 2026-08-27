"""Load PNG skeleton images and binarize (black background, bright foreground)."""

from __future__ import annotations

from typing import Optional

import numpy as np
from PIL import Image


def load_png_as_gray(path: str) -> np.ndarray:
    """Load image as HxW float32 grayscale in [0, 1]."""
    with Image.open(path) as im:
        im = im.convert("L")
        arr = np.asarray(im, dtype=np.float32) / 255.0
    return arr


def binarize_skeleton(
    gray: np.ndarray,
    *,
    invert_if_needed: bool = True,
    threshold: Optional[float] = None,
) -> np.ndarray:
    """
    Convert grayscale to boolean foreground mask.

    Assumes **black background, bright strokes**. If ``invert_if_needed`` and the
    mean intensity is high (mostly white), the image is inverted.
    """
    g = gray.astype(np.float64)
    if threshold is not None:
        fg = g > float(threshold)
    else:
        fg = g > 0.5
    if invert_if_needed and fg.mean() > 0.5:
        fg = ~fg
    return fg.astype(bool)


def load_skeleton_mask(path: str, **kwargs) -> np.ndarray:
    """Load PNG and return boolean foreground mask."""
    gray = load_png_as_gray(path)
    return binarize_skeleton(gray, **kwargs)
