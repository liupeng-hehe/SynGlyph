"""Tests for candidate bank inspection (offline fixtures)."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from omegaconf import OmegaConf

from colorrec.data.inspect_candidate_bank import inspect_candidate_bank, inspect_candidate_bank_df


def _make_row(
    name: str,
    hex_val: str,
    source: str,
    family: str,
    descriptor: str,
    metadata: dict | None = None,
) -> dict:
    return {
        "color_id": f"{source}:{name}",
        "source": source,
        "name": name,
        "hex": hex_val,
        "r": 255,
        "g": 0,
        "b": 0,
        "h": 0.0,
        "s": 1.0,
        "l": 0.5,
        "family": family,
        "descriptor": descriptor,
        "metadata": metadata if metadata is not None else {"_empty": True},
    }


def _inspection_cfg() -> dict:
    return {
        "descriptor_max_recommended_chars": 256,
        "overused_token_warn_pct": 0.25,
        "suspicious_tokens": ["nan", "none", "null", "undefined", "html", "http", "https", "n/a"],
    }


def test_inspect_writes_md_and_json(tmp_path: Path) -> None:
    rows = [
        _make_row("Red A", "#FF0000", "xkcd", "red", "red, warm, vivid"),
        _make_row("Blue B", "#0000FF", "color_pedia", "blue", "blue, calm, clean"),
    ]
    parquet_path = tmp_path / "candidate_colors.parquet"
    pd.DataFrame(rows).to_parquet(parquet_path, index=False)

    out_md = tmp_path / "inspection_report.md"
    out_json = tmp_path / "inspection_report.json"

    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "paths": {
                "candidate_bank_parquet": str(parquet_path),
                "candidate_bank_inspection_md": str(out_md),
                "candidate_bank_inspection_json": str(out_json),
            },
            "data": {"inspection": _inspection_cfg()},
        }
    )

    report = inspect_candidate_bank(cfg)
    assert out_md.exists()
    assert out_json.exists()
    assert report["summary"]["total_rows"] == 2
    assert "xkcd" in report["summary"]["count_by_source"]
    assert "color_pedia" in report["summary"]["count_by_source"]


def test_descriptor_length_stats(tmp_path: Path) -> None:
    df = pd.DataFrame(
        [
            _make_row("A", "#111111", "xkcd", "black", "short"),
            _make_row("B", "#222222", "xkcd", "black", "much longer descriptor text here"),
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    stats = report["summary"]["descriptor_length"]
    assert stats["min"] == 5.0
    assert stats["max"] == len("much longer descriptor text here")
    assert stats["mean"] > stats["min"]


def test_suspicious_token_detected() -> None:
    df = pd.DataFrame(
        [
            _make_row(
                "Dirty",
                "#FF0000",
                "xkcd",
                "red",
                "red, warm, nan, broken",
            )
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    suspicious = report["descriptor_tokens"]["suspicious_tokens"]
    tokens = {item["token"] for item in suspicious}
    assert "nan" in tokens


def test_same_hex_different_names() -> None:
    df = pd.DataFrame(
        [
            _make_row("Scarlet", "#FF0000", "xkcd", "red", "red warm"),
            _make_row("Pure Red", "#FF0000", "color_pedia", "red", "red vivid"),
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    assert report["duplicates"]["same_hex_different_names_count"] >= 1
    top = report["duplicates"]["same_hex_different_names_top"]
    assert top[0]["hex"] == "#FF0000"
    assert len(top[0]["names"]) == 2


def test_same_name_different_hex() -> None:
    df = pd.DataFrame(
        [
            _make_row("Ocean Blue", "#0000FF", "xkcd", "blue", "blue calm"),
            _make_row("ocean blue", "#0044AA", "color_pedia", "blue", "blue deep"),
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    assert report["duplicates"]["same_norm_name_different_hex_count"] >= 1
    top = report["duplicates"]["same_norm_name_different_hex_top"]
    assert top[0]["norm_name"] == "ocean blue"
    assert len(top[0]["hexes"]) == 2


def test_top_tokens_output() -> None:
    df = pd.DataFrame(
        [
            _make_row("A", "#FF0000", "xkcd", "red", "warm, warm, red"),
            _make_row("B", "#FF0000", "xkcd", "red", "warm, bold"),
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    top = report["descriptor_tokens"]["top_100_tokens"]
    assert top[0]["token"] == "warm"
    assert top[0]["count"] >= 3
    assert "pct" in top[0]


def test_source_family_counts() -> None:
    df = pd.DataFrame(
        [
            _make_row("R1", "#FF0000", "xkcd", "red", "red"),
            _make_row("B1", "#0000FF", "color_pedia", "blue", "blue"),
            _make_row("B2", "#0000AA", "color_pedia", "blue", "blue deep"),
        ]
    )
    report = inspect_candidate_bank_df(df, inspection_cfg=_inspection_cfg(), seed=42)
    assert report["summary"]["count_by_source"]["xkcd"] == 1
    assert report["summary"]["count_by_source"]["color_pedia"] == 2
    assert report["summary"]["count_by_family"]["blue"] == 2
