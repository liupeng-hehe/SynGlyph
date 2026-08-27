"""Synthetic bulk pair generator tests."""

from __future__ import annotations

from pathlib import Path

from colorrec.data.studio_bulk_pairs import generate_studio_bulk_rows


def test_generate_studio_bulk_rows_shape() -> None:
    palette = Path("data/raw/user_curated/curated_palette.csv")
    pairs, pal = generate_studio_bulk_rows(
        palette_path=palette,
        max_pairs=20,
        colors_per_anchor=2,
        seed=1,
        max_combo_size=2,
    )
    assert len(pairs) == 20
    assert pairs[0]["anchor_text"]
    assert pairs[0]["positive_hex"].startswith("#")
    assert float(pairs[0]["weight"]) > 0
