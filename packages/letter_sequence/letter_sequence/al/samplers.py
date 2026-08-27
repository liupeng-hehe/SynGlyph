"""Sampling strategies for active learning (deterministic given seed)."""

from __future__ import annotations

import random
from typing import Sequence


def sample_random(
    candidate_ids: Sequence[str],
    k: int,
    rng: random.Random,
) -> list[str]:
    """Sample up to k distinct ids without replacement."""
    ids = list(candidate_ids)
    rng.shuffle(ids)
    return ids[:k]


def sample_topk(scored: list[tuple[str, float]], k: int) -> list[str]:
    """Take k example_ids with highest score (scored sorted descending)."""
    ranked = sorted(scored, key=lambda x: -x[1])
    return [eid for eid, _ in ranked[:k]]
