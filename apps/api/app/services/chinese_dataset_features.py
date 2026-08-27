"""Structural features for Chinese canonical samples (geometry helpers, no DB)."""

from __future__ import annotations

import math
from typing import Any


def bbox_from_median_stroke(stroke_median: list[list[float | int]]) -> list[float]:
    """minX, minY, maxX, maxY for one stroke median polyline."""
    if not stroke_median:
        return [0.0, 0.0, 0.0, 0.0]
    xs = [float(p[0]) for p in stroke_median if len(p) >= 2]
    ys = [float(p[1]) for p in stroke_median if len(p) >= 2]
    if not xs:
        return [0.0, 0.0, 0.0, 0.0]
    return [min(xs), min(ys), max(xs), max(ys)]


def bbox_union(bboxes: list[list[float]]) -> list[float]:
    if not bboxes:
        return [0.0, 0.0, 0.0, 0.0]
    min_x = min(b[0] for b in bboxes)
    min_y = min(b[1] for b in bboxes)
    max_x = max(b[2] for b in bboxes)
    max_y = max(b[3] for b in bboxes)
    return [min_x, min_y, max_x, max_y]


def centroid_from_bbox(b: list[float]) -> list[float]:
    return [(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0]


def polygon_area(points: list[dict[str, float]]) -> float:
    if len(points) < 3:
        return 0.0
    s = 0.0
    for i in range(len(points)):
        j = (i + 1) % len(points)
        s += points[i]["x"] * points[j]["y"] - points[j]["x"] * points[i]["y"]
    return abs(s) / 2.0


def centroid_from_polygon(points: list[dict[str, float]]) -> list[float] | None:
    if not points:
        return None
    sx = sum(float(p["x"]) for p in points)
    sy = sum(float(p["y"]) for p in points)
    n = len(points)
    return [sx / n, sy / n]


def coarse_relative_position(
    region_center: list[float],
    glyph_bbox: list[float],
) -> str:
    """Bucket: left | right | top | bottom | center within glyph bbox."""
    if len(glyph_bbox) < 4:
        return "center"
    min_x, min_y, max_x, max_y = glyph_bbox
    w = max(max_x - min_x, 1e-6)
    h = max(max_y - min_y, 1e-6)
    nx = (region_center[0] - min_x) / w
    ny = (region_center[1] - min_y) / h
    if nx < 0.35:
        hpos = "left"
    elif nx > 0.65:
        hpos = "right"
    else:
        hpos = "center_h"
    if ny < 0.35:
        vpos = "top"
    elif ny > 0.65:
        vpos = "bottom"
    else:
        vpos = "center_v"
    if hpos == "center_h" and vpos in ("center_v",):
        return "center"
    if hpos != "center_h" and vpos != "center_v":
        return f"{vpos}_{hpos}"
    if hpos == "center_h":
        return vpos
    return hpos


def euclidean_distance(a: list[float], b: list[float]) -> float:
    return float(math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))


def curve_presence(curve: Any) -> dict[str, Any]:
    if curve is None:
        return {"present": False}
    if isinstance(curve, dict) and curve:
        return {"present": True, "keys": sorted(curve.keys())[:20]}
    if isinstance(curve, list) and curve:
        return {"present": True, "len": len(curve)}
    return {"present": bool(curve)}
