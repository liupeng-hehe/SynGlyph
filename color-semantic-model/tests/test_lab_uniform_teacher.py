from __future__ import annotations

from colorrec.data.lab_uniform_teacher import build_rows, coverage_report, select_lab_uniform_colors


def test_select_lab_uniform_colors_unique_hex() -> None:
    colors = select_lab_uniform_colors(target=128, levels=16, bins=(8, 10, 10))
    assert len(colors) == 128
    assert len({c.hex for c in colors}) == 128
    report = coverage_report(colors)
    assert report["unique_hex"] == 128


def test_build_rows_shape() -> None:
    colors = select_lab_uniform_colors(target=12, levels=12, bins=(6, 8, 8))
    pairs, palette = build_rows(colors, weight=2.4)
    assert len(pairs) == 12
    assert len(palette) == 12
    assert pairs[0]["positive_hex"].startswith("#")
    assert "LAB L" in pairs[0]["positive_descriptor"]
