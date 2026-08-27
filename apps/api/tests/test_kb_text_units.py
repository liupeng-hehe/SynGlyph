"""Unit tests for KB orthographic n-gram keys (1..4 default, up to 5)."""

from __future__ import annotations

import json

import pytest

from app.services.kb_analytics.text_units import (
    all_pattern_keys_for_text,
    candidate_pattern_keys,
    positions_json_for_pattern,
)


def test_all_pattern_keys_includes_fourgram():
    keys = all_pattern_keys_for_text("document")
    assert "ngram_4" in keys
    assert "ng4:ment" in keys["ngram_4"]
    assert "ngram_2" in keys
    assert "ng2:do" in keys["ngram_2"]


def test_positions_fourgram_start_index():
    # d o c u m e n t -> "ment" starts at index 4
    j = positions_json_for_pattern("document", "ngram_4", "ng4:ment")
    assert json.loads(j) == [4]


def test_legacy_bigram_positions_still_parse():
    j = positions_json_for_pattern("document", "bigram", "bg:do")
    assert json.loads(j) == [0]


def test_candidate_pattern_key_aliases_cover_legacy_pairs():
    assert candidate_pattern_keys("ng2:he") == ["ng2:he", "bg:he"]
    assert candidate_pattern_keys("bg:he") == ["bg:he", "ng2:he"]
    assert candidate_pattern_keys("ng3:the") == ["ng3:the", "tg:the"]
    assert candidate_pattern_keys("tg:the") == ["tg:the", "ng3:the"]


def test_fivegram_when_ngram_max_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SYNGLYPH_KB_NGRAM_MAX", "5")
    keys = all_pattern_keys_for_text("abcde")
    assert "ngram_5" in keys
    assert "ng5:abcde" in keys["ngram_5"]
