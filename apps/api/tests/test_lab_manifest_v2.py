"""Manifest v2 anchor/assist split tests."""

from __future__ import annotations

from app.services.lab_manifest import (
    ANCHOR_COUNT,
    ASSIST_COUNT,
    build_manifest,
    build_manifest_v2,
    merge_kb_coverage_v2,
    parse_manifest,
)


class _FakeProfile:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_build_manifest_v2_splits_10_20():
    mf = build_manifest_v2(seed=42)
    assert mf.manifest_version == 2
    assert len(mf.coverage_anchor_words) == ANCHOR_COUNT
    assert len(mf.coverage_assist_words) == ASSIST_COUNT
    assert len(mf.coverage_words) == ANCHOR_COUNT + ASSIST_COUNT
    assert mf.checks == []
    assert mf.coverage_words == mf.coverage_anchor_words + mf.coverage_assist_words


def test_build_manifest_v1_unchanged():
    mf = build_manifest(seed=99)
    assert mf.manifest_version == 1
    assert len(mf.coverage_words) == 30
    assert len(mf.checks) == 10
    assert mf.coverage_anchor_words == []


def test_merge_kb_coverage_v2_backfill():
    static = build_manifest_v2(seed=1)
    anchor, assist, cov = merge_kb_coverage_v2(["alpha"], [], seed=1, static_fallback=static)
    assert len(anchor) == ANCHOR_COUNT
    assert len(assist) == ASSIST_COUNT
    assert len(cov) == 30


def test_parse_manifest_v2_from_columns():
    mf = build_manifest_v2(seed=7)
    p = _FakeProfile(
        manifest_version=2,
        seed=mf.seed,
        letters_order_json=mf.letters_order_json(),
        coverage_words_json=mf.coverage_words_json(),
        coverage_anchor_words_json=mf.coverage_anchor_words_json(),
        coverage_assist_words_json=mf.coverage_assist_words_json(),
        checks_json=mf.checks_json(),
    )
    parsed = parse_manifest(p)
    assert parsed.is_v2()
    assert parsed.coverage_tier_for_word(parsed.coverage_anchor_words[0]) == "anchor"
    assert parsed.coverage_tier_for_word(parsed.coverage_assist_words[0]) == "assist"


def test_v1_positional_coverage_tier():
    mf = build_manifest(seed=42, manifest_version=1)
    assert mf.coverage_tier_for_word(mf.coverage_words[0]) == "anchor"
    assert mf.coverage_tier_for_word(mf.coverage_words[9]) == "anchor"
    assert mf.coverage_tier_for_word(mf.coverage_words[10]) == "assist"
    assert mf.coverage_tier_for_word(mf.coverage_words[29]) == "assist"
