"""Tests for candidate bank builder."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from omegaconf import OmegaConf

from colorrec.data.build_candidate_bank import build_candidate_bank, dedupe_colors
from colorrec.schemas import CandidateColor


def _make_color(
    name: str,
    hex_val: str,
    descriptor: str,
    source: str = "test",
    meta: dict | None = None,
) -> CandidateColor:
    from colorrec.colorspace import hex_to_rgb, infer_color_family_from_hsl_or_rgb, rgb_to_hsl

    r, g, b = hex_to_rgb(hex_val)
    h, s, l = rgb_to_hsl(r, g, b)
    family = infer_color_family_from_hsl_or_rgb(r, g, b, h=h, s=s, l=l)
    return CandidateColor(
        color_id=f"test:{name}",
        source=source,
        name=name,
        hex=hex_val,
        r=r,
        g=g,
        b=b,
        h=h,
        s=s,
        l=l,
        family=family,
        descriptor=descriptor,
        metadata=meta or {},
    )


def test_dedupe_keeps_richer_descriptor() -> None:
    a = _make_color("Cloud Blue", "#ACC2D9", "short")
    b = _make_color("cloud blue", "#ACC2D9", "much longer and richer descriptor text")
    result = dedupe_colors([a, b])
    assert len(result) == 1
    assert "longer" in result[0].descriptor


def test_build_candidate_bank_xkcd_only(tmp_path: Path) -> None:
    raw_dir = tmp_path / "data" / "raw" / "xkcd"
    raw_dir.mkdir(parents=True)
    rgb_file = raw_dir / "rgb.txt"
    rgb_file.write_text(
        "cloud blue\t#acc2d9\n"
        "cloud blue\t#acc2d9\n"
        "crimson\t#8c000f\n",
        encoding="utf-8",
    )

    artifacts = tmp_path / "artifacts" / "candidate_bank"
    cfg_dict = {
        "project": {"seed": 42},
        "paths": {
            "raw_xkcd": str(rgb_file),
            "candidate_bank_parquet": str(artifacts / "candidate_colors.parquet"),
            "candidate_bank_jsonl": str(artifacts / "candidate_colors.jsonl"),
            "candidate_schema_report": str(artifacts / "schema_report.md"),
        },
        "data": {
            "sources": {"xkcd": True, "color_pedia": False},
            "candidate_bank": {"dedupe": True},
        },
    }
    cfg = OmegaConf.create(cfg_dict)

    colors = build_candidate_bank(cfg)
    assert len(colors) == 2

    report = (artifacts / "schema_report.md").read_text(encoding="utf-8")
    assert "xkcd" in report
    assert "Duplicate rows removed" in report


def test_build_candidate_bank_xkcd_and_color_pedia(tmp_path: Path) -> None:
    xkcd_dir = tmp_path / "data" / "raw" / "xkcd"
    xkcd_dir.mkdir(parents=True)
    (xkcd_dir / "rgb.txt").write_text("shared blue\t#0044aa\n", encoding="utf-8")

    cp_dir = tmp_path / "data" / "raw" / "color_pedia"
    cp_dir.mkdir(parents=True)
    pd.DataFrame(
        [
            {
                "name": "Shared Blue",
                "hex": "#0044AA",
                "keywords": "trustworthy, professional, deep metadata field",
            },
            {"name": "Warm Orange", "hex": "#FF8800", "mood": "friendly"},
        ]
    ).to_parquet(cp_dir / "colors.parquet", index=False)

    artifacts = tmp_path / "artifacts" / "candidate_bank"
    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "paths": {
                "raw_xkcd": str(xkcd_dir / "rgb.txt"),
                "candidate_bank_parquet": str(artifacts / "candidate_colors.parquet"),
                "candidate_bank_jsonl": str(artifacts / "candidate_colors.jsonl"),
                "candidate_schema_report": str(artifacts / "schema_report.md"),
            },
            "data": {
                "sources": {"xkcd": True, "color_pedia": True},
                "candidate_bank": {"dedupe": True},
                "color_pedia": {
                    "local_dir": str(cp_dir),
                    "write_schema_inspection": True,
                    "schema_inspection_path": str(cp_dir / "schema_inspection.json"),
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
                },
            },
        }
    )

    colors = build_candidate_bank(cfg)
    assert len(colors) == 2

    names = {c.name.lower() for c in colors}
    assert "warm orange" in names
    assert "shared blue" in names

    # Dedupe merges xkcd + color_pedia duplicate; richer color_pedia row wins.
    shared = next(c for c in colors if c.name.lower() == "shared blue")
    assert shared.source == "color_pedia"
    assert "trustworthy" in shared.descriptor.lower()

    report = (artifacts / "schema_report.md").read_text(encoding="utf-8")
    assert "xkcd" in report
    assert "color_pedia" in report
    assert "Duplicate rows removed" in report
    assert "**1**" in report or "Duplicate rows removed: **1**" in report
    assert "Descriptor length stats" in report
    assert "Sample rows by source" in report

    df = pd.read_parquet(artifacts / "candidate_colors.parquet")
    assert len(df) == 2
