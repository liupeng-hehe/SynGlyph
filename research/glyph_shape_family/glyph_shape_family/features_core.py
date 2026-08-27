"""Batch-1 skeleton features + batch-2 fields (some implemented, some NaN stubs)."""

from __future__ import annotations

import math
from numbers import Real
from typing import Any

import numpy as np

from glyph_shape_family.geometry import (
    count_components,
    largest_component_mask,
    max_vertical_run_in_mask,
    neighbor_degrees8,
    vertical_projection,
)
from glyph_shape_family.loops_cycles import count_skeleton_loops
from glyph_shape_family.normalize import NormalizeMeta

PROFILE_BINS_DEFAULT = 16


def profile_bins_default() -> int:
    return PROFILE_BINS_DEFAULT


def _vertical_mass_profile(mask: np.ndarray, k: int) -> np.ndarray:
    """K-bin row mass, L1-normalized to sum to 1."""
    h, _w = mask.shape
    proj = vertical_projection(mask)
    if h == 0 or proj.sum() <= 0:
        return np.zeros(k, dtype=np.float64)
    edges = np.linspace(0, h, k + 1)
    out = np.zeros(k, dtype=np.float64)
    for i in range(k):
        lo, hi = int(edges[i]), int(edges[i + 1])
        hi = max(lo + 1, hi)
        out[i] = proj[lo:hi].sum()
    s = out.sum()
    if s > 0:
        out /= s
    return out


def _left_right_symmetry(mask: np.ndarray) -> float:
    """IoU-style overlap of left half vs mirror of right half."""
    h, w = mask.shape
    if w < 2 or h < 1:
        return 1.0
    mid = w // 2
    left = mask[:, :mid]
    right = mask[:, mid : mid + mid]
    if right.shape[1] < left.shape[1]:
        left = left[:, : right.shape[1]]
    rh = np.fliplr(right)
    inter = np.logical_and(left, rh).sum()
    union = np.logical_or(left, rh).sum()
    if union == 0:
        return 1.0
    return float(inter / union)


def _has_dot_full_mask(full: np.ndarray, area_ratio_max: float = 0.08) -> float:
    """Small detached CC above main bbox → 1."""
    from scipy import ndimage

    from glyph_shape_family.geometry import STRUCT8

    if not full.any():
        return 0.0
    lab, n = ndimage.label(full, structure=STRUCT8)
    if n <= 1:
        return 0.0
    counts = np.bincount(lab.ravel())
    main_id = int(np.argmax(counts[1:]) + 1)
    main_area = float((lab == main_id).sum())
    my0, my1, mx0, mx1 = largest_component_mask(full).bbox
    if my1 <= my0:
        return 0.0
    for lid in range(1, n + 1):
        if lid == main_id:
            continue
        sub = lab == lid
        area = float(sub.sum())
        if area < 3:
            continue
        if main_area > 0 and area / main_area > area_ratio_max:
            continue
        ys, _xs = np.where(sub)
        cy = float(ys.mean())
        if cy < my0 - 0.5:
            return 1.0
    return 0.0


def _centroid_xy(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0.0, 0.0
    return float(xs.mean()), float(ys.mean())


def extract_features(
    mask: np.ndarray,
    meta: NormalizeMeta,
    *,
    profile_bins: int = PROFILE_BINS_DEFAULT,
) -> dict[str, Any]:
    """
    Extract features from a **normalized** boolean mask (single canvas).

    Pass the full-image mask before normalize for ``num_components`` / dot logic
    by setting ``meta.extra['full_mask']`` optional; otherwise uses ``mask`` for both.
    """
    full = meta.extra.get("full_mask")
    if full is None:
        full = mask

    out: dict[str, Any] = {}
    out["num_components"] = float(count_components(full))

    # Topological / geometric stats on normalized canvas for scale consistency
    cc = largest_component_mask(mask)
    main = cc.mask
    deg = neighbor_degrees8(main)
    sk_count = int(main.sum())

    out["num_loops"] = float(count_skeleton_loops(main))
    out["num_endpoints"] = float(int(np.sum(deg == 1)))
    out["num_junctions"] = float(int(np.sum(deg >= 3)))

    h, w = mask.shape
    total = float(mask.sum()) + 1e-9
    top_mass = float(mask[: max(1, h // 3), :].sum()) / total
    bot_mass = float(mask[max(0, 2 * h // 3) :, :].sum()) / total
    out["has_ascender"] = float(top_mass > 0.12)
    out["has_descender"] = float(bot_mass > 0.12)

    prof = _vertical_mass_profile(mask, profile_bins)
    for i in range(profile_bins):
        out[f"vprof_{i}"] = float(prof[i])

    out["left_right_symmetry"] = float(_left_right_symmetry(mask))

    out["has_dot"] = float(_has_dot_full_mask(full))

    main_canvas = largest_component_mask(mask).mask
    stem_ratio = max_vertical_run_in_mask(main_canvas) / float(max(h, 1))
    out["has_long_stem"] = float(stem_ratio > 0.45)

    # Batch-2: partial implementations + NaN stubs
    ys, xs = np.where(main)
    if len(ys) > 0:
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
        bw, bh = max(1, x1 - x0), max(1, y1 - y0)
        cx, cy = _centroid_xy(main)
        bx_c = (x0 + x1) / 2.0
        out["loop_y_position"] = float((cy - y0) / bh)
        side = (cx - bx_c) / (bw / 2.0) if bw > 1 else 0.0
        side = float(max(-1.0, min(1.0, side)))
        out["loop_side_signed"] = side
        out["loop_side_abs"] = float(abs(side))
    else:
        out["loop_y_position"] = math.nan
        out["loop_side_signed"] = math.nan
        out["loop_side_abs"] = math.nan

    out["has_crossbar"] = math.nan
    out["has_diagonal_cross"] = math.nan
    out["has_serpentine_or_zigzag"] = math.nan

    vp = vertical_projection(mask)
    if len(vp) >= 5:
        smooth = np.convolve(vp, np.ones(3) / 3.0, mode="same")
        peaks = 0
        for i in range(1, len(smooth) - 1):
            if smooth[i] > smooth[i - 1] and smooth[i] > smooth[i + 1] and smooth[i] > 0.05 * (smooth.max() + 1e-9):
                peaks += 1
        out["num_humps"] = float(peaks)
    else:
        out["num_humps"] = math.nan

    out["normalize_heuristic_baseline"] = float(meta.heuristic_baseline)
    out["normalize_scale"] = float(meta.scale)
    return out


def feature_dict_to_row(
    d: dict[str, Any],
    *,
    profile_bins: int = PROFILE_BINS_DEFAULT,
) -> dict[str, float]:
    """Flatten to float-only row for CSV (drops non-numeric extras)."""
    keys = [
        "num_components",
        "num_loops",
        "num_endpoints",
        "num_junctions",
        "has_ascender",
        "has_descender",
        *[f"vprof_{i}" for i in range(profile_bins)],
        "left_right_symmetry",
        "has_dot",
        "has_long_stem",
        "loop_y_position",
        "loop_side_signed",
        "loop_side_abs",
        "has_crossbar",
        "has_diagonal_cross",
        "has_serpentine_or_zigzag",
        "num_humps",
        "normalize_heuristic_baseline",
        "normalize_scale",
    ]
    row: dict[str, float] = {}
    for k in keys:
        v = d.get(k, math.nan)
        if isinstance(v, bool):
            row[k] = float(v)
        elif isinstance(v, (int, float)) or isinstance(v, (np.integer, np.floating)):
            row[k] = float(v)
        elif isinstance(v, Real):
            row[k] = float(v)
        else:
            row[k] = float("nan")
    return row
