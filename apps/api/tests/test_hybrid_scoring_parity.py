"""Parity: shared acquisition_policy matches manual hybrid math for a fixed pool."""

from __future__ import annotations

import math

from app.config.active_learning import NORMALIZATION, WEIGHTS
from letter_sequence.al.acquisition_policy import HybridNormConfig, score_hybrid_candidates
from letter_sequence.al.normalization import robust_minmax_normalize


def test_hybrid_scoring_matches_manual_reference():
    raw_rows = [
        {
            "stimulus_id": "s1",
            "text": "ab",
            "boundary_uncertainty": 0.4,
            "segment_attribute_uncertainty": 0.1,
            "segment_novelty": 0.2,
            "coverage_gain": 0.3,
            "instability": 0.0,
        },
        {
            "stimulus_id": "s2",
            "text": "cd",
            "boundary_uncertainty": 0.1,
            "segment_attribute_uncertainty": 0.9,
            "segment_novelty": 0.5,
            "coverage_gain": 0.1,
            "instability": 0.2,
        },
        {
            "stimulus_id": "s3",
            "text": "ef",
            "boundary_uncertainty": 0.7,
            "segment_attribute_uncertainty": 0.2,
            "segment_novelty": 0.1,
            "coverage_gain": 0.8,
            "instability": 0.4,
        },
    ]
    weights = {
        "boundary_uncertainty": WEIGHTS.boundary_uncertainty,
        "segment_attribute_uncertainty": WEIGHTS.segment_attribute_uncertainty,
        "segment_novelty": WEIGHTS.segment_novelty,
        "coverage_gain": WEIGHTS.coverage_gain,
        "instability": WEIGHTS.instability,
    }
    norm = HybridNormConfig(
        lower_percentile=NORMALIZATION.lower_percentile,
        upper_percentile=NORMALIZATION.upper_percentile,
        collapse_fallback=NORMALIZATION.collapse_fallback,
    )
    out = score_hybrid_candidates(raw_rows, weights=weights, norm=norm)

    keys = (
        "boundary_uncertainty",
        "segment_attribute_uncertainty",
        "segment_novelty",
        "coverage_gain",
        "instability",
    )
    fm = {k: [float(r[k]) for r in raw_rows] for k in keys}
    norms = {
        k: robust_minmax_normalize(
            fm[k],
            p_low=norm.lower_percentile,
            p_high=norm.upper_percentile,
            fallback=norm.collapse_fallback,
        )
        for k in keys
    }
    for i, row in enumerate(raw_rows):
        exp_score = sum(weights[k] * norms[k][i] for k in keys)
        assert math.isclose(out[i]["score"], exp_score, rel_tol=1e-9, abs_tol=1e-9)
        for k in keys:
            assert math.isclose(out[i]["score_norm_json"][k], norms[k][i], rel_tol=1e-9, abs_tol=1e-9)
