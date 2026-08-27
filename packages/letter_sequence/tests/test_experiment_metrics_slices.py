"""Fixed slice bucket thresholds."""

from letter_sequence.eval.experiment_metrics import (
    BOUNDARY_DENSITY_LOW_MAX,
    WORD_LENGTH_MEDIUM_MAX,
    WORD_LENGTH_SHORT_MAX,
    boundary_density_bucket,
    word_length_bucket,
)


def test_word_length_buckets():
    assert word_length_bucket(2) == "short"
    assert word_length_bucket(3) == "short"
    assert word_length_bucket(5) == "medium"
    assert word_length_bucket(8) == "long"


def test_boundary_density_bucket():
    assert boundary_density_bucket([], 3) == "low"
    assert boundary_density_bucket([0.6, 0.6], 3) == "high"


def test_constants_documented():
    assert WORD_LENGTH_SHORT_MAX == 3
    assert WORD_LENGTH_MEDIUM_MAX == 7
    assert BOUNDARY_DENSITY_LOW_MAX == 0.25
