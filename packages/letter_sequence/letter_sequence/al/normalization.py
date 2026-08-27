"""Robust percentile min–max normalization (shared with API hybrid AL)."""

from __future__ import annotations

import math


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    q = max(0.0, min(100.0, float(q)))
    sorted_values = sorted(float(v) for v in values)
    pos = (len(sorted_values) - 1) * (q / 100.0)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return float(sorted_values[lo])
    frac = pos - lo
    return float(sorted_values[lo] * (1.0 - frac) + sorted_values[hi] * frac)


def robust_minmax_normalize(
    values: list[float],
    *,
    p_low: float,
    p_high: float,
    fallback: float,
) -> list[float]:
    if not values:
        return []
    lower = percentile(values, p_low)
    upper = percentile(values, p_high)
    if upper <= lower:
        c = max(0.0, min(1.0, float(fallback)))
        return [c for _ in values]

    out: list[float] = []
    denom = upper - lower
    for v in values:
        clipped = min(max(float(v), lower), upper)
        out.append((clipped - lower) / denom)
    return out
