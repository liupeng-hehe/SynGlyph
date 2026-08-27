"""Tests for xkcd rgb.txt loader."""

from __future__ import annotations

from pathlib import Path

from colorrec.data.load_xkcd import load_xkcd_colors


def test_load_xkcd_fixture(tmp_path: Path) -> None:
    rgb_file = tmp_path / "rgb.txt"
    rgb_file.write_text(
        "cloud blue\t#acc2d9\n"
        "dark pastel green\t#56ae57\n"
        "#8c000f crimson\n"
        "invalid line without hex\n"
        "\n",
        encoding="utf-8",
    )

    colors = load_xkcd_colors(rgb_file)
    assert len(colors) == 3

    by_name = {c.name.lower(): c for c in colors}
    assert "cloud blue" in by_name
    assert "dark pastel green" in by_name
    assert "crimson" in by_name

    cloud = by_name["cloud blue"]
    assert cloud.hex == "#ACC2D9"
    assert cloud.source == "xkcd"
    assert cloud.color_id.startswith("xkcd:")
    assert cloud.descriptor
    assert cloud.family

    crimson = by_name["crimson"]
    assert crimson.hex == "#8C000F"


def test_load_xkcd_missing_file(tmp_path: Path) -> None:
    missing = tmp_path / "missing.txt"
    try:
        load_xkcd_colors(missing)
        assert False, "expected FileNotFoundError"
    except FileNotFoundError as exc:
        assert "xkcd rgb.txt not found" in str(exc)
