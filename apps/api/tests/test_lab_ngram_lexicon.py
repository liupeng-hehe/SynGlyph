"""Lab n-gram lexicon unit tests."""

from __future__ import annotations

from app.models.lab_profile import LabProfile
from app.services.lab_ngram_lexicon import (
    load_lexicon,
    pattern_keys_for_word,
    update_lexicon_from_coverage_save,
    word_spans_for_lexicon,
)


def test_word_spans_cover_full_word():
    spans = word_spans_for_lexicon("cat")
    assert spans
    covered = sum(s["end"] - s["start"] for s in spans)
    assert covered == 3


def test_update_lexicon_from_manual_adjustments():
    profile = LabProfile(
        id="p1",
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
            {"index": 0, "char": "c", "color": "#ff0000", "prominence": 0.7, "spread": 0.3},
            {"index": 1, "char": "a", "color": "#00ff00", "prominence": 0.6, "spread": 0.4},
            {"index": 2, "char": "t", "color": "#0000ff", "prominence": 0.5, "spread": 0.5},
        ],
        "boundary_influence": [0.4, 0.6],
    }
    keys = update_lexicon_from_coverage_save(
        profile,
        word="cat",
        manual_adjustments=manual,
        accepted_prediction=False,
    )
    assert keys
    lex = load_lexicon(profile)
    assert len(lex) >= 1
    any_entry = next(iter(lex.values()))
    assert "lab" in any_entry


def test_pattern_keys_for_word_nonempty():
    assert pattern_keys_for_word("shine")
