"""Validation AL fallback tests."""

from __future__ import annotations

import random

from app.services.lab_manifest import checks_for_coverage_words, parse_manifest


class _FakeProfile:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_checks_for_coverage_words_disjoint():
    cov = [f"word{i}" for i in range(30)]
    checks = checks_for_coverage_words(cov, random.Random(1))
    assert len(checks) == 10
    cov_l = {w.lower() for w in cov}
    for spec in checks:
        assert spec["word"].lower() not in cov_l


def test_parse_manifest_v2_empty_checks():
    p = _FakeProfile(
        manifest_version=2,
        seed=1,
        letters_order_json='["a"]',
        coverage_words_json='["w"]',
        coverage_anchor_words_json='["w"]',
        coverage_assist_words_json="[]",
        checks_json="[]",
    )
    m = parse_manifest(p)
    assert m.checks == []
