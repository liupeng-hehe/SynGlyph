"""Family vs full feature column sets and optional profile folding."""

from __future__ import annotations

import pandas as pd

from glyph_shape_family.features_core import PROFILE_BINS_DEFAULT


def vprof_columns(profile_bins: int = PROFILE_BINS_DEFAULT) -> list[str]:
    return [f"vprof_{i}" for i in range(profile_bins)]


def base_numeric_columns(profile_bins: int = PROFILE_BINS_DEFAULT) -> list[str]:
    return [
        "num_components",
        "num_loops",
        "num_endpoints",
        "num_junctions",
        "has_ascender",
        "has_descender",
        *vprof_columns(profile_bins),
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
    ]


def family_columns(profile_bins: int = PROFILE_BINS_DEFAULT) -> list[str]:
    """Family mode: drop signed lateral info; keep loop_side_abs."""
    cols = [
        "num_components",
        "num_loops",
        "num_endpoints",
        "num_junctions",
        "has_ascender",
        "has_descender",
        *vprof_columns(profile_bins),
        "left_right_symmetry",
        "has_dot",
        "has_long_stem",
        "loop_y_position",
        "loop_side_abs",
        "has_crossbar",
        "has_diagonal_cross",
        "has_serpentine_or_zigzag",
        "num_humps",
    ]
    return cols


def full_columns(profile_bins: int = PROFILE_BINS_DEFAULT) -> list[str]:
    """Full mode: include signed lateral and all batch-2 columns."""
    return base_numeric_columns(profile_bins)


def fold_profile_vertical_symmetry(
    df: pd.DataFrame,
    profile_bins: int = PROFILE_BINS_DEFAULT,
) -> pd.DataFrame:
    """
    Replace first half of vprof bins with average of symmetric bins (about mid-height),
    mirroring the vertical mass profile to reduce up/down flip sensitivity within profile.
    For left-right mirror, family mode already drops loop_side_signed; profile folding
    here averages bin i with bin (K-1-i) for each vprof column.
    """
    out = df.copy()
    k = profile_bins
    for i in range(k // 2):
        a, b = f"vprof_{i}", f"vprof_{k - 1 - i}"
        if a in out.columns and b in out.columns:
            m = (out[a].fillna(0) + out[b].fillna(0)) / 2.0
            out[a] = m
            out[b] = m
    return out


def apply_feature_mode(
    df: pd.DataFrame,
    mode: str,
    *,
    profile_bins: int = PROFILE_BINS_DEFAULT,
    fold_vprof: bool = False,
) -> pd.DataFrame:
    """
    Select columns for ``family`` or ``full`` mode.

    ``fold_vprof``: if True (typically with family), average symmetric vprof bins.
    """
    m = mode.lower().strip()
    if m == "family":
        cols = family_columns(profile_bins)
        sub = df[[c for c in cols if c in df.columns]].copy()
        if fold_vprof:
            sub = fold_profile_vertical_symmetry(sub, profile_bins=profile_bins)
        return sub
    if m == "full":
        cols = full_columns(profile_bins)
        return df[[c for c in cols if c in df.columns]].copy()
    raise ValueError(f"Unknown mode {mode!r}; expected 'family' or 'full'")
