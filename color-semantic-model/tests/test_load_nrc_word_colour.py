"""Tests for NRC Word-Colour loader."""

from __future__ import annotations

from pathlib import Path

import pytest

from colorrec.data.load_nrc_word_colour import (
    FAMILY_PROTOTYPES,
    load_nrc_word_colour_pairs,
    normalize_nrc_color,
)


def test_normalize_nrc_color() -> None:
    assert normalize_nrc_color("Red") == "red"
    assert normalize_nrc_color("gray") == "grey"
    assert normalize_nrc_color("unknown") is None


def test_load_nrc_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "nrc.csv"
    csv_path.write_text(
        "word,color,association\n"
        "anger,red,1\n"
        "ocean,blue,1\n",
        encoding="utf-8",
    )
    pairs = load_nrc_word_colour_pairs(tmp_path, default_weight=0.9)
    assert len(pairs) == 2
    assert pairs[0].source == "nrc_word_colour"
    assert pairs[0].positive
    assert pairs[0].weight == 0.9


def test_unknown_color_skipped(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    csv_path = tmp_path / "nrc.csv"
    csv_path.write_text(
        "word,color\n"
        "anger,red\n"
        "sky,teal\n",
        encoding="utf-8",
    )
    pairs = load_nrc_word_colour_pairs(tmp_path)
    assert len(pairs) == 1
    assert pairs[0].anchor == "anger"


def test_sense_added_to_anchor(tmp_path: Path) -> None:
    csv_path = tmp_path / "nrc.csv"
    csv_path.write_text(
        "word,sense,color\n"
        "bank,financial institution,blue\n",
        encoding="utf-8",
    )
    pairs = load_nrc_word_colour_pairs(csv_path)
    assert len(pairs) == 1
    assert "financial institution" in pairs[0].anchor


def test_missing_raw_dir_returns_empty(tmp_path: Path) -> None:
    pairs = load_nrc_word_colour_pairs(tmp_path / "missing")
    assert pairs == []


def test_family_prototype_non_empty() -> None:
    for family, desc in FAMILY_PROTOTYPES.items():
        assert desc
        assert family in desc


def test_load_nrc_tsv(tmp_path: Path) -> None:
    tsv_path = tmp_path / "nrc.tsv"
    tsv_path.write_text("word\tcolor\nhappy\tyellow\n", encoding="utf-8")
    pairs = load_nrc_word_colour_pairs(tmp_path)
    assert len(pairs) == 1
    assert "yellow" in pairs[0].positive.lower()
