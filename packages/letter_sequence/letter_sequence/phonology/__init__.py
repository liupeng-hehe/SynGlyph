"""Pronunciation-derived features for letter-sequence models."""

from letter_sequence.phonology.cache import get_cached, get_or_enrich, set_cached
from letter_sequence.phonology.enrich import PronLayerOut, CharPhon, enrich_word
from letter_sequence.phonology.layout import (
    PHON_LAYOUT_V1,
    PHON_LAYOUT_V1_DIM,
    PHON_V1_CHANNEL_NAMES,
    LEGACY_SLICE,
    SYLLABLE_STRESS_SLICE,
    NEIGHBOR_SLICE,
)

__all__ = [
    "enrich_word",
    "PronLayerOut",
    "CharPhon",
    "get_or_enrich",
    "get_cached",
    "set_cached",
    "PHON_LAYOUT_V1",
    "PHON_LAYOUT_V1_DIM",
    "PHON_V1_CHANNEL_NAMES",
    "LEGACY_SLICE",
    "SYLLABLE_STRESS_SLICE",
    "NEIGHBOR_SLICE",
]
