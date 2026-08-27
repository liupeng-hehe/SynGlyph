"""8-neighborhood degrees, connected components, projections."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

STRUCT8 = np.ones((3, 3), dtype=int)


@dataclass(frozen=True)
class CCInfo:
    """Largest foreground 8-connected component."""

    mask: np.ndarray
    label_image: np.ndarray
    label_id: int
    bbox: tuple[int, int, int, int]  # y0, y1, x0, x1 inclusive-exclusive on y1,x1


def count_components(mask: np.ndarray) -> int:
    """Number of 8-connected foreground components."""
    if not mask.any():
        return 0
    _, n = ndimage.label(mask, structure=STRUCT8)
    return int(n)


def largest_component_mask(mask: np.ndarray) -> CCInfo:
    """Keep largest 8-CC; return mask and metadata."""
    if not mask.any():
        z = np.zeros_like(mask, dtype=bool)
        return CCInfo(mask=z, label_image=np.zeros_like(mask, dtype=int), label_id=0, bbox=(0, 0, 0, 0))
    lab, n = ndimage.label(mask, structure=STRUCT8)
    if n == 0:
        z = np.zeros_like(mask, dtype=bool)
        return CCInfo(mask=z, label_image=lab, label_id=0, bbox=(0, 0, 0, 0))
    counts = np.bincount(lab.ravel())
    # label 0 is background
    lid = int(np.argmax(counts[1:]) + 1)
    sub = lab == lid
    ys, xs = np.where(sub)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    return CCInfo(mask=sub, label_image=lab, label_id=lid, bbox=(y0, y1, x0, x1))


def neighbor_degrees8(mask: np.ndarray) -> np.ndarray:
    """Per-pixel 8-neighbor count on foreground; background is 0."""
    h, w = mask.shape
    deg = np.zeros((h, w), dtype=np.int32)
    sk = mask.astype(bool)
    for y in range(h):
        for x in range(w):
            if not sk[y, x]:
                continue
            c = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and sk[ny, nx]:
                        c += 1
            deg[y, x] = c
    return deg


def vertical_projection(mask: np.ndarray) -> np.ndarray:
    """Per-row sum of foreground pixels (length H)."""
    return mask.sum(axis=1).astype(np.float64)


def max_vertical_run_in_mask(mask: np.ndarray) -> int:
    """Longest contiguous True run along any single column."""
    if not mask.any():
        return 0
    h, w = mask.shape
    best = 0
    for x in range(w):
        col = mask[:, x]
        run = 0
        for v in col:
            if v:
                run += 1
                best = max(best, run)
            else:
                run = 0
    return int(best)
