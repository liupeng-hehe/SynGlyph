"""Tests for curated palette loader."""

from __future__ import annotations

from pathlib import Path

import pytest

from colorrec.data.load_user_curated_palette import load_user_curated_palette


def test_curated_palette_rows_become_candidate_color(tmp_path: Path) -> None:
    csv_path = tmp_path / "curated_palette.csv"
    csv_path.write_text(
        "name,hex,family,descriptor,keywords,weight\n"
        "Sunny Yellow,#FFD700,yellow,bright festival yellow,playful summer,1.2\n"
        "Soft Sage,#BCB88A,green,,organic skincare,1.0\n",
        encoding="utf-8",
    )

    colors = load_user_curated_palette(csv_path)
    assert len(colors) == 2
    sunny = next(c for c in colors if "Sunny" in c.name)
    assert sunny.source == "user_curated_palette"
    assert sunny.family == "yellow"
    assert sunny.metadata["family_display"] == "yellow"
    assert sunny.metadata["raw_name"] == "Sunny Yellow"
    assert "festival" in sunny.descriptor.lower()

    sage = next(c for c in colors if "Sage" in c.name)
    assert sage.family == "green"
    assert sage.metadata["family_hsl"]


def test_curated_palette_missing_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_user_curated_palette(tmp_path / "missing.csv")
