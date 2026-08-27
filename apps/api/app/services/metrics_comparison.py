"""Delta helpers for MAE-style metrics (lower is better)."""

from __future__ import annotations

EPS = 1e-9


def mae_error_reduction_pct(mae_baseline: float, mae_new: float) -> float:
    """Positive when error decreased (good)."""
    b = max(float(mae_baseline), EPS)
    return 100.0 * (b - float(mae_new)) / b
