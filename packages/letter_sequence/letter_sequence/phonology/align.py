"""Map ARPABet CMU-style phones to per-letter syllable / stress (heuristic)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# ARPABet vowel token ends with 0, 1, or 2 stress
_VOWEL_PHONE = re.compile(r"^([A-Z]+)([012])$")


@dataclass
class SyllabifiedWord:
    """One stress digit per syllable (0/1/2) left-to-right."""

    stress_digits: list[int]  # len = n_syl
    n_syl: int
    # Confidence in [0,1] — lower if alignment fallback used
    confidence: float


def parse_phones_string(phones: str) -> list[str]:
    """Space-separated ARPABet tokens, empty -> []."""
    s = (phones or "").strip().upper()
    if not s:
        return []
    return s.split()


def split_into_syllable_stresses(phone_tokens: list[str]) -> SyllabifiedWord:
    """
    One syllable ≈ one vowel phoneme (with stress digit) in American CMU / g2p_en output.
    Consonant-only tokens are ignored for stress list length; n_syl = # vowel phones.
    """
    stresses: list[int] = []
    for t in phone_tokens:
        t = t.strip().upper()
        m = _VOWEL_PHONE.match(t)
        if m:
            stresses.append(int(m.group(2)))
    if not stresses:
        return SyllabifiedWord(stress_digits=[], n_syl=0, confidence=0.0)
    return SyllabifiedWord(stress_digits=stresses, n_syl=len(stresses), confidence=0.9)


def stress_pattern_str(stresses: list[int]) -> str:
    return "".join(str(s) for s in stresses) if stresses else ""


@dataclass
class LetterSyllableAlignment:
    syllable_per_letter: list[int]  # same len as word letters
    is_in_stressed: list[bool]  # any stress >0 in that syll
    is_stressed_nucleus: list[bool]
    is_primary_stress: list[bool]  # syllable has a 1
    char_role: list[str]  # onset | nucleus | coda | unknown
    # distance in syllables to nearest syllable with max stress
    dist_to_stress: list[int]


_VOWEL_LETTERS = set("aeiouy")


def _is_vowel_char(ch: str) -> bool:
    return ch.lower() in _VOWEL_LETTERS


def align_orthography(
    word_lower: str,
    syll: SyllabifiedWord,
) -> LetterSyllableAlignment | None:
    """
    Map each letter to a syllable index (0..n_syl-1) by vowel order.
    Fails (returns None) if no letters or no syllable info to align.
    """
    letters = [c for c in word_lower if c.isalpha()]
    if not letters or syll.n_syl == 0:
        return None

    n_syl = syll.n_syl
    stresses = syll.stress_digits
    # Positions of vowel letters in word (0-indexed in letters list)
    vowel_pos = [i for i, c in enumerate(letters) if _is_vowel_char(c)]
    n_v = len(vowel_pos)
    syl_per = [0] * len(letters)
    # Which syllable index each letter maps to; default: proportional bucket
    if n_v == n_syl:
        for vi, sidx in zip(vowel_pos, range(n_syl)):
            syl_per[vi] = sidx
        # fill consonants: forward-fill from previous, backward from next
        for i in range(len(letters)):
            if not _is_vowel_char(letters[i]):
                # find prev vowel syllable, next vowel syllable
                left = next((syl_per[j] for j in range(i, -1, -1) if _is_vowel_char(letters[j])), 0)
                right = next(
                    (syl_per[j] for j in range(i, len(letters), 1) if _is_vowel_char(letters[j])),
                    n_syl - 1,
                )
                syl_per[i] = left if (i - left) < (right - i) else right
    else:
        # Mismatch: bucket letters evenly into n_syl bins
        L = len(letters)
        for i in range(L):
            syl_per[i] = min(n_syl - 1, int(i * n_syl / L)) if n_syl else 0

    is_in_stressed = []
    is_nucleus = []
    is_primary = []
    char_role: list[str] = []
    dist_to: list[int] = []

    stressed_syl_indices = {i for i, s in enumerate(stresses) if s > 0}
    primary_syl_indices = {i for i, s in enumerate(stresses) if s == 1}
    for i, ch in enumerate(letters):
        si = syl_per[i]
        st = stresses[si] if si < len(stresses) else 0
        is_in = st > 0
        is_in_stressed.append(is_in)
        is_n = _is_vowel_char(ch) and (st > 0)
        is_nucleus.append(is_n)
        is_primary.append(st == 1 and _is_vowel_char(ch))
        if _is_vowel_char(ch):
            char_role.append("nucleus")
        else:
            char_role.append(_consonant_role(letters, syl_per, i))
        dmin = 999
        for sj in stressed_syl_indices:
            dmin = min(dmin, abs(si - sj))
        if not stressed_syl_indices:
            dmin = 0
        dist_to.append(dmin)

    return LetterSyllableAlignment(
        syllable_per_letter=syl_per,
        is_in_stressed=is_in_stressed,
        is_stressed_nucleus=is_nucleus,
        is_primary_stress=is_primary,
        char_role=char_role,
        dist_to_stress=dist_to,
    )


def _consonant_role(letters: list[str], syl_per: list[int], i: int) -> str:
    """Heuristic onset vs coda for a consonant at i."""
    j = i + 1
    while j < len(letters):
        if _is_vowel_char(letters[j]):
            if syl_per[j] == syl_per[i]:
                return "onset"
            return "coda"
        j += 1
    return "coda"
