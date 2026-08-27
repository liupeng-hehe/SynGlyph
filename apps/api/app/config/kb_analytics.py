"""Orthographic KB analytics knobs (n-gram span for pattern extraction)."""

from __future__ import annotations

import os


def kb_ngram_max() -> int:
    """
    Maximum character n-gram order to index in KB (inclusive), in addition to unigrams.
    Default 4 (covers suffix chunks like ``ment``, ``tion``); set ``SYNGLYPH_KB_NGRAM_MAX=5`` to include 5-grams.
    Clamped to ``[2, 5]`` (always at least bigrams when >=2).
    """
    raw = os.environ.get("SYNGLYPH_KB_NGRAM_MAX", "4")
    try:
        v = int(raw)
    except ValueError:
        v = 4
    return max(2, min(5, v))
