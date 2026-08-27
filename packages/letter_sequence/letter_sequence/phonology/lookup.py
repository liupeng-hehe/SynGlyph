"""Dictionary-first pronunciation (CMUdict), then vowel-heuristic syllable count for OOV."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import pronouncing

from letter_sequence.phonology.align import (
    SyllabifiedWord,
    parse_phones_string,
    split_into_syllable_stresses,
)

_VOWEL = set("aeiouy")


class PronSource(str, Enum):
    CMUDICT = "cmudict"
    G2P = "g2p"
    FALLBACK = "fallback"
    FAILED = "failed"


@dataclass
class LookupResult:
    phones: str
    source: PronSource
    confidence: float
    g2p_raw: list[str] | None = None


def oov_syllable_count(w: str) -> int:
    """Heuristic syllable count from orthography: one nucleus per vowel cluster, at least 1."""
    letters = [c for c in w.lower() if c.isalpha()]
    if not letters:
        return 0
    n_syl = 0
    i = 0
    while i < len(letters):
        if letters[i] in _VOWEL:
            n_syl += 1
            while i < len(letters) and letters[i] in _VOWEL:
                i += 1
        else:
            i += 1
    return max(1, n_syl)


def phones_for_word(word: str) -> LookupResult:
    w = (word or "").strip().lower()
    if not w or not w.isalpha():
        return LookupResult(phones="", source=PronSource.FAILED, confidence=0.0, g2p_raw=None)

    try:
        prs = pronouncing.phones_for_word(w)
    except Exception:
        prs = []
    if prs:
        return LookupResult(phones=prs[0], source=PronSource.CMUDICT, confidence=0.95, g2p_raw=None)

    n = oov_syllable_count(w)
    if n <= 0:
        return LookupResult(phones="", source=PronSource.FALLBACK, confidence=0.0, g2p_raw=None)
    # Placeholder phones: one unstressed vowel per syllable (aligner uses vowel count only)
    phones = " ".join(["AH0"] * n)
    return LookupResult(phones=phones, source=PronSource.FALLBACK, confidence=0.35, g2p_raw=None)


def syllabify_from_lookup(lr: LookupResult) -> tuple[SyllabifiedWord, float]:
    if not (lr.phones and lr.phones.strip()):
        return SyllabifiedWord(stress_digits=[], n_syl=0, confidence=0.0), 0.0
    toks = parse_phones_string(lr.phones)
    sw = split_into_syllable_stresses(toks)
    conf = min(lr.confidence, sw.confidence) * lr.confidence
    return sw, conf
