"""Tests for weighted training pair oversampling."""

from __future__ import annotations

import pytest

from colorrec.schemas import TrainingPair
from colorrec.training.oversampling import apply_weighted_oversampling, weight_to_copies


def _pair(source: str, weight: float, idx: int = 0) -> TrainingPair:
    return TrainingPair(
        pair_id=f"{source}:{idx}",
        anchor=f"anchor {source} {idx}",
        positive=f"positive {idx}",
        source=source,
        weight=weight,
    )


@pytest.mark.parametrize(
    ("weight", "expected"),
    [
        (0.5, 1),
        (1.0, 1),
        (1.5, 2),
        (2.0, 2),
        (2.5, 3),
        (3.0, 3),
        (3.5, 4),
        (10.0, 4),
    ],
)
def test_weight_to_copies_tiers(weight: float, expected: int) -> None:
    assert weight_to_copies(weight) == expected


def test_weight_to_copies_respects_max() -> None:
    assert weight_to_copies(5.0, max_oversample_copies=2) == 2


def test_apply_weighted_oversampling_expands_pairs() -> None:
    pairs = [
        _pair("xkcd_self", 1.0, 0),
        _pair("user_curated", 3.5, 1),
        _pair("color_pedia_metadata", 2.5, 2),
    ]
    oversampled, report = apply_weighted_oversampling(pairs, max_oversample_copies=4)
    assert len(oversampled) == 1 + 4 + 3
    assert report["raw_train_pairs"] == 3
    assert report["effective_train_examples"] == 8
    assert report["pairs_by_source_before"]["user_curated"] == 1
    assert report["pairs_by_source_after"]["user_curated"] == 4


def test_user_curated_effective_share() -> None:
    pairs = [
        _pair("xkcd_self", 1.0, 0),
        _pair("xkcd_self", 1.0, 1),
        _pair("user_curated", 3.5, 2),
    ]
    _, report = apply_weighted_oversampling(pairs)
    # effective: 1 + 1 + 4 = 6; user_curated = 4/6
    assert report["user_curated_effective_share"] == pytest.approx(4 / 6)


def test_disabled_oversampling_is_noop() -> None:
    pairs = [_pair("user_curated", 3.5, 0)]
    oversampled, report = apply_weighted_oversampling(pairs, enabled=False)
    assert len(oversampled) == 1
    assert report["effective_train_examples"] == 1
    assert report["weighted_oversampling_enabled"] is False
