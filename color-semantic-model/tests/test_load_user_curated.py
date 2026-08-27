"""Tests for user-curated training pair loader."""

from __future__ import annotations

from pathlib import Path

import pytest
from omegaconf import OmegaConf

from colorrec.data.load_user_curated import load_user_curated_pairs
from colorrec.schemas import CandidateColor


def _make_color(name: str, hex_val: str, descriptor: str) -> CandidateColor:
    from colorrec.colorspace import hex_to_rgb, infer_color_family_from_hsl_or_rgb, rgb_to_hsl

    r, g, b = hex_to_rgb(hex_val)
    h, s, l = rgb_to_hsl(r, g, b)
    family = infer_color_family_from_hsl_or_rgb(r, g, b, h=h, s=s, l=l)
    return CandidateColor(
        color_id=f"test:{name}",
        source="test",
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
        metadata={},
    )


def test_schema_a_generates_pair(tmp_path: Path) -> None:
    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight\n"
        'quiet luxury,warm ivory,#F6EFE2,"warm ivory, white family, soft, clean",white,2.5\n',
        encoding="utf-8",
    )
    pairs = load_user_curated_pairs(csv_path, default_weight=2.5)
    assert len(pairs) == 1
    assert pairs[0].anchor == "quiet luxury"
    assert pairs[0].positive_hex == "#F6EFE2"
    assert pairs[0].weight == 2.5
    assert pairs[0].source == "user_curated"


def test_schema_b_preferred_hexes_multiple_pairs(tmp_path: Path) -> None:
    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "query,preferred_hexes,rejected_hexes\n"
        'warm nostalgic poster,"#B7410E,#704214","#98EFF9,#00FF00"\n',
        encoding="utf-8",
    )
    bank = [_make_color("rust", "#B7410E", "rust, red family, warm")]
    pairs = load_user_curated_pairs(csv_path, candidate_bank=bank, default_weight=2.5)
    assert len(pairs) == 2
    assert all(p.anchor == "warm nostalgic poster" for p in pairs)
    assert pairs[0].negatives == ["#98EFF9", "#00FF00"] or pairs[1].negatives == ["#98EFF9", "#00FF00"]


def test_schema_b_rejected_hexes_stored(tmp_path: Path) -> None:
    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "query,preferred_hexes,rejected_hexes\n"
        'jazz poster,#B7410E,"#98EFF9,#00FF00"\n',
        encoding="utf-8",
    )
    pairs = load_user_curated_pairs(csv_path, default_weight=2.5)
    assert len(pairs) == 1
    assert pairs[0].negatives == ["#98EFF9", "#00FF00"] or pairs[0].metadata.get("rejected_hexes") == [
        "#98EFF9",
        "#00FF00",
    ]


def test_missing_descriptor_uses_candidate_bank(tmp_path: Path) -> None:
    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight\n"
        "calm brand,warm ivory,#F6EFE2,,white,2.5\n",
        encoding="utf-8",
    )
    bank = [_make_color("warm ivory", "#F6EFE2", "warm ivory, white family, soft")]
    pairs = load_user_curated_pairs(csv_path, candidate_bank=bank, default_weight=2.5)
    assert len(pairs) == 1
    assert "warm ivory" in pairs[0].positive.lower()
    assert pairs[0].positive_color_id == "test:warm ivory"


def test_missing_file_returns_empty(caplog: pytest.LogCaptureFixture, tmp_path: Path) -> None:
    pairs = load_user_curated_pairs(tmp_path / "missing.csv")
    assert pairs == []


def test_default_weight_from_config(tmp_path: Path) -> None:
    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight\n"
        "calm brand,warm ivory,#F6EFE2,soft ivory,white,\n",
        encoding="utf-8",
    )
    pairs = load_user_curated_pairs(csv_path, default_weight=3.0)
    assert pairs[0].weight == 3.0


def test_load_user_curated_from_config(tmp_path: Path) -> None:
    from colorrec.data.load_user_curated import load_user_curated_from_config

    csv_path = tmp_path / "user_pairs.csv"
    csv_path.write_text(
        "anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight\n"
        "calm brand,warm ivory,#F6EFE2,soft ivory,white,2.5\n",
        encoding="utf-8",
    )
    cfg = OmegaConf.create(
        {
            "paths": {"raw_user_curated": str(csv_path)},
            "data": {"training_pairs": {"weights": {"user_curated": 2.5}}},
        }
    )
    pairs = load_user_curated_from_config(cfg, candidate_bank=[])
    assert len(pairs) == 1
