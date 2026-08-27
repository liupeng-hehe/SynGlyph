"""Deterministic random sampler."""

from letter_sequence.al.samplers import sample_random


def test_random_sampler_deterministic():
    ids = [f"id{i}" for i in range(20)]
    import random

    r1 = random.Random(123)
    r2 = random.Random(123)
    a = sample_random(ids, 5, r1)
    b = sample_random(ids, 5, r2)
    assert a == b
    assert len(set(a)) == 5
