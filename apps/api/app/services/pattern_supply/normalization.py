from __future__ import annotations

import re
import unicodedata

_LEADING_TRAILING_PUNCT = re.compile(r"^[^\w'-]+|[^\w'-]+$")
_SPACE_RE = re.compile(r"\s+")
_DASH_RE = re.compile(r"-{2,}")
_FANCY_APOSTROPHE_RE = re.compile(r"[’`]")


def normalize_word(word: str) -> str:
    """
    Canonical normalization used for registry uniqueness and exclusion checks.

    Not the same as ``english_word_casing.normalize_word_for_stimulus_text`` (bulk stimulus text casing).

    Rules:
    - trim whitespace
    - NFKC
    - lowercase
    - strip leading/trailing punctuation (while preserving inner apostrophe/hyphen)
    - collapse whitespace
    - normalize fancy apostrophes to ASCII apostrophe
    - collapse repeated hyphens to one
    """
    text = unicodedata.normalize("NFKC", (word or "").strip())
    text = _FANCY_APOSTROPHE_RE.sub("'", text)
    text = text.lower()
    text = _LEADING_TRAILING_PUNCT.sub("", text)
    text = _SPACE_RE.sub(" ", text)
    text = _DASH_RE.sub("-", text)
    return text.strip("'- ")

