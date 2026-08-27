"""Resize / pad skeleton to a common canvas; record metadata for ascender/descender heuristics."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.ndimage import zoom


@dataclass
class NormalizeMeta:
    """How the mask was normalized (for debugging and heuristic zones)."""

    ref_height: int
    canvas_hw: tuple[int, int]
    scale: float
    heuristic_baseline: bool
    pad_y0: int = 0
    pad_x0: int = 0
    crop_bbox: Optional[tuple[int, int, int, int]] = None  # y0,y1,x0,x1 before resize
    extra: dict = field(default_factory=dict)


def _bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0, 0, 0, 0
    return int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1


def normalize_canvas(
    mask: np.ndarray,
    *,
    ref_height: int = 64,
    canvas: Optional[tuple[int, int]] = None,
    pad_value: bool = False,
) -> tuple[np.ndarray, NormalizeMeta]:
    """
    Crop to bbox of foreground, scale so bbox height == ``ref_height`` (preserve aspect),
    then center-pad into ``canvas`` (default ``(ref_height, ref_height)``).

    If the mask is empty, returns zeros with the requested canvas shape.
    """
    h, w = mask.shape
    y0, y1, x0, x1 = _bbox_from_mask(mask)
    if y1 <= y0 or x1 <= x0:
        ch, cw = canvas if canvas is not None else (ref_height, ref_height)
        return np.full((ch, cw), pad_value, dtype=bool), NormalizeMeta(
            ref_height=ref_height,
            canvas_hw=(ch, cw),
            scale=1.0,
            heuristic_baseline=True,
            extra={"empty": True},
        )

    crop = mask[y0:y1, x0:x1].astype(bool)
    ch, cw = crop.shape
    long_side = max(ch, cw)
    scale = ref_height / float(long_side)
    # Keep a 1px-thin bbox edge at 1px after scale (otherwise a 10×1 line becomes a solid block).
    new_h = 1 if ch == 1 else max(1, int(round(ch * scale)))
    new_w = 1 if cw == 1 else max(1, int(round(cw * scale)))
    if new_h == ch and new_w == cw:
        resized = crop
    else:
        # Nearest-neighbor zoom keeps a 1-pixel skeleton thin; bilinear thickens the mask.
        resized = zoom(crop.astype(np.float32), (new_h / ch, new_w / cw), order=0) >= 0.5

    if canvas is None:
        canvas = (ref_height, max(ref_height, resized.shape[1]))
    ch, cw = canvas
    out = np.full((ch, cw), pad_value, dtype=bool)
    sh, sw = resized.shape
    py = (ch - sh) // 2
    px = (cw - sw) // 2
    out[py : py + sh, px : px + sw] = resized

    meta = NormalizeMeta(
        ref_height=ref_height,
        canvas_hw=(ch, cw),
        scale=float(ref_height / float(long_side)),
        heuristic_baseline=True,
        pad_y0=py,
        pad_x0=px,
        crop_bbox=(y0, y1, x0, x1),
    )
    return out, meta
