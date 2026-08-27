"""N-gram compose tests."""

from __future__ import annotations

from app.models.lab_profile import LabProfile
from app.services.lab_ngram_compose import compose_word_from_lexicon, merge_compose_with_model
from app.services.lab_ngram_lexicon import update_lexicon_from_coverage_save


def _profile_with_lexicon() -> LabProfile:
    profile = LabProfile(
        id="p2",
        user_key="u",
        display_name="t",
        slug="t",
        seed=1,
        letters_order_json='["a"]',
        coverage_words_json='[]',
        coverage_anchor_words_json="[]",
        coverage_assist_words_json="[]",
        checks_json="[]",
        user_pattern_lexicon_json="{}",
    )
    manual = {
        "letters": [
            {"index": 0, "char": "c", "color": "#336699", "prominence": 0.7, "spread": 0.3},
            {"index": 1, "char": "a", "color": "#336699", "prominence": 0.7, "spread": 0.3},
            {"index": 2, "char": "t", "color": "#336699", "prominence": 0.7, "spread": 0.3},
        ],
    }
    update_lexicon_from_coverage_save(profile, word="cat", manual_adjustments=manual, accepted_prediction=False)
    return profile


def test_compose_hits_lexicon_for_same_word():
    profile = _profile_with_lexicon()
    out = compose_word_from_lexicon(profile, "cat")
    assert len(out.pred_lab) == 3
    assert out.ngram_hits


def test_greedy_lexicon_matches_substring():
    profile = LabProfile(
        id="p3",
        user_key="u",
        display_name="t",
        slug="t",
        seed=1,
        letters_order_json='["a"]',
        coverage_words_json='[]',
        coverage_anchor_words_json="[]",
        coverage_assist_words_json="[]",
        checks_json="[]",
        user_pattern_lexicon_json=(
            '{"ng2:er": {"lab": [[90.0, 0.0, 0.0], [93.0, 0.0, 0.0]], '
            '"prom": [0.1, 0.4], "spread": [0.9, 0.6], "boundary": [0.5]}}'
        ),
    )
    out = compose_word_from_lexicon(profile, "anniversary")
    assert "ng2:er" in out.ngram_hits
    assert out.pred_prominence[5] == 0.1
    assert out.pred_spread[6] == 0.6
    assert 5 not in out.model_gaps
    assert 6 not in out.model_gaps


def test_merge_compose_with_model_fills_gaps():
    profile = _profile_with_lexicon()
    compose = compose_word_from_lexicon(profile, "dog")
    model_out = {
        "pred_lab": [[50.0, 0.0, 0.0], [51.0, 1.0, -1.0], [52.0, 2.0, -2.0]],
        "pred_prominence": [0.62, 0.62, 0.62],
        "pred_spread": [0.38, 0.38, 0.38],
        "pred_boundary": [0.48, 0.48],
    }
    merged = merge_compose_with_model(compose, model_out)
    assert len(merged.pred_lab) == 3
