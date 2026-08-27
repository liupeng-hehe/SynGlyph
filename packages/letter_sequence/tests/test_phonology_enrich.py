"""Phonology preprocessor: common words, structure, failure, layout stability."""

from __future__ import annotations

import numpy as np
import pytest

from letter_sequence.phonology import PHON_LAYOUT_V1_DIM, enrich_word
from letter_sequence.phonology.enrich import PronLayerOut
from letter_sequence.phonology.layout import PHON_V1_CHANNEL_NAMES


def test_banana_has_syllables_and_stress():
    o = enrich_word("banana")
    assert o.syllable_count >= 1
    assert len(o.stress_pattern) == o.syllable_count
    assert o.feature_matrix.shape[1] == PHON_LAYOUT_V1_DIM
    assert o.feature_matrix.shape[0] == len("banana")
    assert len(o.char_rows) == len("banana")
    assert o.phon_mask.shape[0] == len("banana")


def test_hello_in_dict():
    o = enrich_word("hello")
    assert o.syllable_count >= 1
    assert o.pronunciation_source in ("cmudict", "g2p", "fallback")
    to = o.to_dict()
    assert to["feature_dim"] == PHON_LAYOUT_V1_DIM
    assert len(PHON_V1_CHANNEL_NAMES) == PHON_LAYOUT_V1_DIM


def test_empty_word_failed():
    o = enrich_word("")
    assert o.pronunciation_source == "failed"
    assert o.syllable_count == 0


def test_nonsense_oov_may_still_produce_g2p():
    o = enrich_word("xyzabcqwertyplugh")
    # Must not raise; may be g2p, fallback, or low confidence
    assert isinstance(o, PronLayerOut)
    assert o.feature_matrix.shape[1] == PHON_LAYOUT_V1_DIM
    _ = o.to_dict()


def test_feature_matrix_float32():
    o = enrich_word("color")
    assert o.feature_matrix.dtype == np.float32
    assert np.isfinite(o.feature_matrix).all()
