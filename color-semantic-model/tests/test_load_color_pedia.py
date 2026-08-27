"""Tests for Color-Pedia loader (offline fixtures only)."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.data.load_color_pedia import (
    detect_columns,
    get_last_color_pedia_load_stats,
    load_color_pedia_colors,
    parse_rgb_value,
)


def _cp_cfg(tmp_path: Path, **overrides) -> OmegaConf:
    base = {
        "local_dir": str(tmp_path),
        "write_schema_inspection": True,
        "schema_inspection_path": str(tmp_path / "schema_inspection.json"),
        "descriptor_max_chars": 256,
        "column_candidates": {
            "name": ["name", "color_name", "title", "color"],
            "hex": ["hex", "hex_code", "hex_value", "HEX"],
            "rgb": ["rgb", "RGB"],
            "r": ["r", "red"],
            "g": ["g", "green"],
            "b": ["b", "blue"],
            "h": ["h", "hue"],
            "s": ["s", "saturation"],
            "l": ["l", "lightness", "luminosity"],
            "mood": ["mood", "moods"],
            "emotion": ["emotion", "emotions"],
            "symbolism": ["symbolism", "symbolic_meaning", "meaning"],
            "personality": ["personality", "personalities"],
            "keywords": ["keywords", "tags"],
            "use_case": ["use_case", "use_cases", "usage", "applications"],
        },
    }
    base.update(overrides)
    return OmegaConf.create(base)


def test_parse_rgb_variants() -> None:
    assert parse_rgb_value("rgb(255, 0, 0)") == (255, 0, 0)
    assert parse_rgb_value("255,0,0") == (255, 0, 0)
    assert parse_rgb_value([10, 20, 30]) == (10, 20, 30)


def test_hex_and_name_parquet(tmp_path: Path) -> None:
    df = pd.DataFrame(
        [
            {"color_name": "Scarlet Flame", "hex_code": "#FF0000"},
        ]
    )
    df.to_parquet(tmp_path / "colors.parquet", index=False)
    cfg = _cp_cfg(tmp_path)

    colors = load_color_pedia_colors(cfg)
    assert len(colors) == 1
    assert colors[0].name == "Scarlet Flame"
    assert colors[0].hex == "#FF0000"
    assert colors[0].source == "color_pedia"
    assert colors[0].descriptor


def test_rgb_string_csv(tmp_path: Path) -> None:
    df = pd.DataFrame([{"title": "Pure Red", "RGB": "rgb(255, 0, 0)"}])
    df.to_csv(tmp_path / "colors.csv", index=False)

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 1
    assert colors[0].hex == "#FF0000"


def test_rgb_columns_json(tmp_path: Path) -> None:
    df = pd.DataFrame([{"name": "Green", "red": 0, "green": 128, "blue": 0}])
    df.to_json(tmp_path / "colors.json", orient="records")

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 1
    assert colors[0].hex == "#008000"


def test_hsl_columns_jsonl(tmp_path: Path) -> None:
    rows = [{"name": "Blue", "hue": 240, "saturation": 100, "lightness": 50}]
    with (tmp_path / "colors.jsonl").open("w", encoding="utf-8") as fh:
        fh.write(json.dumps(rows[0]) + "\n")

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 1
    assert colors[0].family == "blue"


def test_missing_name_skipped(tmp_path: Path) -> None:
    df = pd.DataFrame([{"hex": "#FF0000"}])
    df.to_parquet(tmp_path / "colors.parquet", index=False)

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 0
    stats = get_last_color_pedia_load_stats()
    assert stats is not None
    assert stats.skipped > 0


def test_missing_color_values_skipped(tmp_path: Path) -> None:
    df = pd.DataFrame([{"name": "No Color"}])
    df.to_parquet(tmp_path / "colors.parquet", index=False)

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 0
    stats = get_last_color_pedia_load_stats()
    assert stats is not None
    assert stats.skip_reasons.get("missing_color_values", 0) == 1


def test_metadata_in_descriptor(tmp_path: Path) -> None:
    df = pd.DataFrame(
        [
            {
                "name": "Trust Blue",
                "hex": "#0044AA",
                "mood": "calm",
                "emotion": "trust",
                "keywords": "professional, clean",
            }
        ]
    )
    df.to_parquet(tmp_path / "colors.parquet", index=False)

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 1
    desc = colors[0].descriptor.lower()
    assert "calm" in desc
    assert "trust" in desc
    assert "professional" in desc


def test_schema_inspection_written(tmp_path: Path) -> None:
    df = pd.DataFrame([{"name": "White", "hex": "#FFFFFF"}])
    df.to_parquet(tmp_path / "colors.parquet", index=False)
    inspection_path = tmp_path / "schema_inspection.json"
    cfg = _cp_cfg(tmp_path, schema_inspection_path=str(inspection_path))

    load_color_pedia_colors(cfg)
    assert inspection_path.exists()
    report = json.loads(inspection_path.read_text(encoding="utf-8"))
    assert "columns" in report
    assert "detected_columns" in report
    assert "sample_rows" in report
    assert len(report["sample_rows"]) <= 5


def test_detect_columns_case_insensitive() -> None:
    detected = detect_columns(
        ["Color_Name", "HEX_CODE"],
        {"name": ["color_name"], "hex": ["hex_code"]},
    )
    assert detected["name"] == "Color_Name"
    assert detected["hex"] == "HEX_CODE"


def test_spaced_column_names_like_hf_dataset(tmp_path: Path) -> None:
    """Match real Color-Pedia-style headers without hardcoding exact schema."""
    df = pd.DataFrame(
        [
            {
                "Color Name": "Deep Maroon",
                "HEX Code": "#D62559",
                "Mood": "Strong",
                "Keywords": "powerful, bold",
            }
        ]
    )
    df.to_parquet(tmp_path / "colors.parquet", index=False)

    colors = load_color_pedia_colors(_cp_cfg(tmp_path))
    assert len(colors) == 1
    assert colors[0].name == "Deep Maroon"
    assert colors[0].hex == "#D62559"
    assert "powerful" in colors[0].descriptor.lower()
