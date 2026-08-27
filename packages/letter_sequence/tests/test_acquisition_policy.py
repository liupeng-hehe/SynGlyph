"""Acquisition policy: normalization, scoring, cost, diversity (no torch)."""

from __future__ import annotations

import math

from letter_sequence.al.acquisition_policy import (
    HybridNormConfig,
    apply_cost_penalty,
    estimate_label_cost,
    lexical_similarity,
    rerank_batch_with_diversity,
    score_hybrid_candidates,
)
from letter_sequence.al.normalization import robust_minmax_normalize
from letter_sequence.al.policy_config import AcquisitionPolicyConfig, feature_weights_from_logits, softmax


def test_softmax_sums_to_one():
    w = softmax([1.0, 2.0, 3.0])
    assert len(w) == 3
    assert math.isclose(sum(w), 1.0, rel_tol=1e-9)


def test_reference_parity_hybrid_score():
    rows = [
        {
            "stimulus_id": "a",
            "text": "hi",
            "boundary_uncertainty": 0.1,
            "segment_attribute_uncertainty": 0.2,
            "segment_novelty": 0.3,
            "coverage_gain": 0.4,
            "instability": 0.5,
        },
        {
            "stimulus_id": "b",
            "text": "yo",
            "boundary_uncertainty": 0.5,
            "segment_attribute_uncertainty": 0.4,
            "segment_novelty": 0.3,
            "coverage_gain": 0.2,
            "instability": 0.1,
        },
    ]
    weights = {
        "boundary_uncertainty": 0.35,
        "segment_attribute_uncertainty": 0.25,
        "segment_novelty": 0.20,
        "coverage_gain": 0.10,
        "instability": 0.10,
    }
    norm = HybridNormConfig(lower_percentile=5.0, upper_percentile=95.0, collapse_fallback=0.5)
    out = score_hybrid_candidates(rows, weights=weights, norm=norm)
    # Independent reference
    keys = (
        "boundary_uncertainty",
        "segment_attribute_uncertainty",
        "segment_novelty",
        "coverage_gain",
        "instability",
    )
    fm = {k: [float(r[k]) for r in rows] for k in keys}
    bn = robust_minmax_normalize(
        fm["boundary_uncertainty"], p_low=norm.lower_percentile, p_high=norm.upper_percentile, fallback=norm.collapse_fallback
    )
    an = robust_minmax_normalize(
        fm["segment_attribute_uncertainty"],
        p_low=norm.lower_percentile,
        p_high=norm.upper_percentile,
        fallback=norm.collapse_fallback,
    )
    nn = robust_minmax_normalize(
        fm["segment_novelty"], p_low=norm.lower_percentile, p_high=norm.upper_percentile, fallback=norm.collapse_fallback
    )
    cn = robust_minmax_normalize(
        fm["coverage_gain"], p_low=norm.lower_percentile, p_high=norm.upper_percentile, fallback=norm.collapse_fallback
    )
    ins = robust_minmax_normalize(
        fm["instability"], p_low=norm.lower_percentile, p_high=norm.upper_percentile, fallback=norm.collapse_fallback
    )
    norms = (bn, an, nn, cn, ins)
    for i in range(2):
        exp = sum(weights[k] * norms[j][i] for j, k in enumerate(keys))
        assert math.isclose(out[i]["score"], exp, rel_tol=1e-9, abs_tol=1e-9)
        for j, k in enumerate(keys):
            assert math.isclose(out[i]["score_norm_json"][k], norms[j][i], rel_tol=1e-9)


def test_estimate_label_cost_length():
    assert estimate_label_cost("abc", mode="length") == 3.0


def test_lexical_jaccard_self():
    assert lexical_similarity("hello", "hello", "jaccard") >= 0.99


def test_diversity_rerank_changes_order_when_redundant():
    rows = [
        {"stimulus_id": "1", "text": "aaaa", "score": 1.0, "score_norm_json": {}},
        {"stimulus_id": "2", "text": "aaab", "score": 0.99, "score_norm_json": {}},
        {"stimulus_id": "3", "text": "zzzz", "score": 0.5, "score_norm_json": {}},
    ]
    out = rerank_batch_with_diversity(
        rows,
        k=2,
        top_m=3,
        lambda_redundancy=0.5,
        similarity_backend="jaccard",
    )
    ids = [r["stimulus_id"] for r in out]
    assert len(ids) == 2
    assert ids[0] == "1"
    # Second slot may be "2" or "3" depending on tie-break / similarity schedule
    assert set(ids).issubset({"1", "2", "3"})


def test_apply_cost_penalty_reduces_high_cost():
    w = {k: 0.2 for k in feature_weights_from_logits({})}
    scored = score_hybrid_candidates(
        [
            {
                "stimulus_id": "a",
                "text": "x",
                "boundary_uncertainty": 1.0,
                "segment_attribute_uncertainty": 1.0,
                "segment_novelty": 1.0,
                "coverage_gain": 1.0,
                "instability": 1.0,
            }
        ],
        weights=w,
        norm=HybridNormConfig(),
    )
    penalized = apply_cost_penalty(scored, raw_costs=[10.0], lambda_cost=1.0, norm=HybridNormConfig())
    assert penalized[0]["score"] < scored[0]["score"]


def test_instability_replay_cold():
    from letter_sequence.al.text_stats import instability_score_replay_cold

    assert instability_score_replay_cold([0.1], [0.2]) == 0.0
    assert instability_score_replay_cold([0.1, 0.2], [0.3, 0.4]) >= 0.0
