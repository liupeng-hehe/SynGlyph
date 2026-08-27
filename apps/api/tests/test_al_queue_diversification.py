"""AL queue diversification: tie-break sort and config defaults."""

from __future__ import annotations

from app.config import active_learning as al_cfg
from app.services.active_learning_scoring import ALScoredRow, sort_scored_rows


def _row(stimulus_id: str, score: float) -> ALScoredRow:
    return ALScoredRow(
        stimulus_id=stimulus_id,
        text="word",
        score=score,
        boundary_uncertainty=0.0,
        segment_attribute_uncertainty=0.0,
        segment_novelty=0.0,
        coverage_gain=0.0,
        instability=0.0,
        score_raw_json={},
        score_norm_json={
            "boundary_uncertainty": 0.0,
            "segment_attribute_uncertainty": 0.0,
            "segment_novelty": 0.0,
            "coverage_gain": 0.0,
            "instability": 0.0,
        },
    )


def test_sort_scored_rows_hash_is_deterministic_for_equal_scores():
    a = _row("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", 0.5)
    b = _row("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", 0.5)
    c = _row("cccccccc-cccc-cccc-cccc-cccccccccccc", 0.5)
    rows = [c, a, b]
    sort_scored_rows(rows, "hash")
    order1 = [r.stimulus_id for r in rows]
    rows2 = [c, a, b]
    sort_scored_rows(rows2, "hash")
    order2 = [r.stimulus_id for r in rows2]
    assert order1 == order2
    assert set(order1) == {a.stimulus_id, b.stimulus_id, c.stimulus_id}


def test_sort_scored_rows_none_stable_for_equal_scores():
    a = _row("id-a", 0.5)
    b = _row("id-b", 0.5)
    rows = [a, b]
    sort_scored_rows(rows, "none")
    assert [r.stimulus_id for r in rows] == ["id-a", "id-b"]


def test_sort_scored_rows_score_descending():
    hi = _row("hi", 0.9)
    lo = _row("lo", 0.1)
    rows = [lo, hi]
    sort_scored_rows(rows, "hash")
    assert rows[0].stimulus_id == "hi"
    assert rows[1].stimulus_id == "lo"


def test_config_defaults_in_range():
    assert 2 <= al_cfg.al_candidate_sql_fetch_multiplier() <= 30
    assert 2 <= al_cfg.al_scoring_pool_factor() <= 20
    assert 6 <= al_cfg.al_kb_candidate_sql_multiplier() <= 60
    assert al_cfg.al_tie_break_mode() in ("none", "hash", "random")
