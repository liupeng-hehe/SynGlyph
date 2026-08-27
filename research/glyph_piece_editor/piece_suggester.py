"""
Rule-based piece labels (mirror TS heuristics; optional offline use).
"""
from __future__ import annotations

import numpy as np


def _bbox(pixels: list[tuple[int, int]]):
    xs = [p[0] for p in pixels]
    ys = [p[1] for p in pixels]
    return min(xs), min(ys), max(xs), max(ys)


def _centroid(pixels: list[tuple[int, int]]):
    sx = sum(p[0] for p in pixels)
    sy = sum(p[1] for p in pixels)
    n = len(pixels) or 1
    return sx / n, sy / n


def suggest_piece(
    pixels: list[tuple[int, int]],
    w: int,
    h: int,
) -> dict:
    """Return suggested type, orientation, side, etc."""
    if not pixels:
        return {"type": "unknown", "confidence": 0.0}
    pix_set = set(pixels)

    def n_in(p):
        x, y = p
        c = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == dy == 0:
                    continue
                if (x + dx, y + dy) in pix_set:
                    c += 1
        return c

    endpoints = sum(1 for p in pixels if n_in(p) == 1)
    all_deg2 = all(n_in(p) == 2 for p in pixels) and len(pixels) > 4
    closed = endpoints == 0 and all_deg2
    bx0, by0, bx1, by1 = _bbox(pixels)
    gw = max(1e-6, bx1 - bx0)
    gh = max(1e-6, by1 - by0)
    aspect = gw / gh
    cx, cy = _centroid(pixels)
    cx_n = cx / max(1, w - 1)
    cy_n = cy / max(1, h - 1)
    side = "left" if cx_n < 0.38 else "right" if cx_n > 0.62 else "center"
    vertical = "top" if cy_n < 0.38 else "bottom" if cy_n > 0.62 else "middle"

    ptype = "unknown"
    if closed:
        ptype = "loop"
    elif endpoints == 2 and aspect > 2.5:
        ptype = "line"
    elif endpoints == 2 and aspect < 0.45:
        ptype = "line"
    elif endpoints == 2:
        ptype = "arc"

    return {
        "type": ptype,
        "side_in_glyph": side,
        "vertical_in_glyph": vertical,
        "closed": closed,
        "centroid_norm": [cx_n, cy / max(1, h - 1)],
        "bbox_norm": [
            bx0 / max(1, w - 1),
            by0 / max(1, h - 1),
            bx1 / max(1, w - 1),
            by1 / max(1, h - 1),
        ],
        "confidence": 0.5,
    }
