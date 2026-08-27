"""Public façade: word -> structured phonology + per-letter V1 feature vectors."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from letter_sequence.phonology.align import (
    LetterSyllableAlignment,
    align_orthography,
    stress_pattern_str,
)
from letter_sequence.phonology.layout import PHON_LAYOUT_V1, PHON_LAYOUT_V1_DIM
from letter_sequence.phonology.lookup import PronSource, phones_for_word, syllabify_from_lookup

_DEFAULT_PREPROC_VERSION = "1.0.0"


@dataclass
class CharPhon:
    char_idx: int
    char: str
    is_initial: bool
    is_final: bool
    is_vowel: bool
    word_len_norm: float
    syllable_idx: int
    is_in_stressed_syllable: bool
    distance_to_stress: int
    same_vowel_repetition_local: float
    prev_is_vowel: bool
    next_is_vowel: bool
    char_role_in_syllable: str
    is_stressed_nucleus: bool
    syllable_position_from_start: int
    syllable_position_from_end: int
    is_primary_stress_syllable: bool


@dataclass
class PronLayerOut:
    raw_text: str
    normalized_text: str
    letters: list[str]
    char_rows: list[CharPhon]
    syllable_count: int
    stress_pattern: str
    pronunciation_source: str
    pronunciation_confidence: float
    preprocessing_version: str
    feature_matrix: np.ndarray = field(repr=False)
    phon_mask: np.ndarray = field(repr=False)
    cache_blob: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_text": self.raw_text,
            "normalized_text": self.normalized_text,
            "letters": self.letters,
            "char_rows": [
                {
                    "char_idx": c.char_idx,
                    "char": c.char,
                    "is_initial": c.is_initial,
                    "is_final": c.is_final,
                    "is_vowel": c.is_vowel,
                    "word_len_norm": c.word_len_norm,
                    "syllable_idx": c.syllable_idx,
                    "is_in_stressed_syllable": c.is_in_stressed_syllable,
                    "distance_to_stress": c.distance_to_stress,
                    "same_vowel_repetition_local": c.same_vowel_repetition_local,
                    "prev_is_vowel": c.prev_is_vowel,
                    "next_is_vowel": c.next_is_vowel,
                    "char_role_in_syllable": c.char_role_in_syllable,
                    "is_stressed_nucleus": c.is_stressed_nucleus,
                    "syllable_position_from_start": c.syllable_position_from_start,
                    "syllable_position_from_end": c.syllable_position_from_end,
                    "is_primary_stress_syllable": c.is_primary_stress_syllable,
                }
                for c in self.char_rows
            ],
            "syllable_count": self.syllable_count,
            "stress_pattern": self.stress_pattern,
            "pronunciation_source": self.pronunciation_source,
            "pronunciation_confidence": self.pronunciation_confidence,
            "preprocessing_version": self.preprocessing_version,
            "feature_layout": PHON_LAYOUT_V1,
            "feature_dim": PHON_LAYOUT_V1_DIM,
        }


def _char_role_to_float(role: str) -> float:
    m = {
        "nucleus": 1.0,
        "onset": 0.33,
        "coda": 0.66,
        "unknown": 0.0,
    }
    return m.get(role, 0.0)


def _same_vowel_local(letters: list[str], i: int) -> float:
    if i < 0 or i >= len(letters) or not letters[i].isalpha():
        return 0.0
    ch = letters[i].lower()
    w = 1
    for j in range(i - 1, -1, -1):
        if letters[j].lower() == ch:
            w += 1
        else:
            break
    for j in range(i + 1, len(letters)):
        if letters[j].lower() == ch:
            w += 1
        else:
            break
    return min(1.0, 0.25 * w)


def _build_rows_and_matrix(
    letters: list[str],
    align: LetterSyllableAlignment | None,
    syllable_count: int,
    max_len: int,
    stress_digits: list[int],
) -> tuple[list[CharPhon], np.ndarray, np.ndarray]:
    T = len(letters)
    feat = np.zeros((T, PHON_LAYOUT_V1_DIM), dtype=np.float32)
    pmask = np.zeros(T, dtype=np.float32)
    rows: list[CharPhon] = []
    n_s = max(1, syllable_count) if syllable_count > 0 else 1
    for i, ch in enumerate(letters):
        cl = ch.lower()
        is_v = cl in "aeiouy"
        is_first = i == 0
        is_last = i == T - 1
        wln = T / max_len
        sidx = 0
        in_st = False
        d_st = 0
        pv = letters[i - 1].lower() in "aeiouy" if i > 0 else False
        nv = letters[i + 1].lower() in "aeiouy" if i < T - 1 else False
        role = "unknown"
        is_sn = False
        s_from_start = 0
        s_from_end = 0
        if align is not None and stress_digits and syllable_count > 0:
            sidx = align.syllable_per_letter[i]
            in_st = align.is_in_stressed[i]
            d_st = align.dist_to_stress[i]
            is_sn = align.is_stressed_nucleus[i]
            role = align.char_role[i]
            s_from_start = sidx
            s_from_end = (syllable_count - 1 - sidx) if syllable_count else 0
        s_local = _same_vowel_local(letters, i)
        st_syll = stress_digits[sidx] if sidx < len(stress_digits) else 0
        is_primary_char = st_syll == 1 and is_v
        row = CharPhon(
            char_idx=i,
            char=ch,
            is_initial=is_first,
            is_final=is_last,
            is_vowel=is_v,
            word_len_norm=wln,
            syllable_idx=sidx,
            is_in_stressed_syllable=in_st,
            distance_to_stress=d_st,
            same_vowel_repetition_local=s_local,
            prev_is_vowel=pv,
            next_is_vowel=nv,
            char_role_in_syllable=role,
            is_stressed_nucleus=is_sn,
            syllable_position_from_start=s_from_start,
            syllable_position_from_end=s_from_end,
            is_primary_stress_syllable=is_primary_char,
        )
        rows.append(row)
        s_norm = sidx / max(1, n_s - 1) if n_s > 1 else 0.0
        d_max = max(1, max(syllable_count, 1))
        d_n = 1.0 - min(1.0, d_st / d_max) if syllable_count else 0.0
        feat[i, 0] = 1.0 if is_v else 0.0
        feat[i, 1] = 1.0 if is_first else 0.0
        feat[i, 2] = 1.0 if is_last else 0.0
        feat[i, 3] = wln
        feat[i, 4] = s_norm
        feat[i, 5] = 1.0 if in_st else 0.0
        feat[i, 6] = d_n
        feat[i, 7] = s_local
        feat[i, 8] = 1.0 if pv else 0.0
        feat[i, 9] = 1.0 if nv else 0.0
        feat[i, 10] = _char_role_to_float(role)
        feat[i, 11] = 1.0 if is_sn else 0.0
        feat[i, 12] = s_from_start / max(1, n_s - 1) if n_s > 1 else 0.0
        feat[i, 13] = s_from_end / max(1, n_s - 1) if n_s > 1 else 0.0
        feat[i, 14] = 1.0 if is_primary_char else 0.0
        feat[i, 15] = 0.0
        pmask[i] = 1.0 if (align is not None and bool(stress_digits)) else 0.0
    return rows, feat, pmask


def _fallback_letters_and_features(
    word: str,
    max_len: int,
    pv: str,
) -> PronLayerOut:
    """No pronunciation: still emit legacy [T,4]-compatible block in first 4 dims, mask 0, pad rest to 16."""
    raw = word or ""
    letters = [c for c in raw.lower() if c.isalpha()]
    T = len(letters)
    feat = np.zeros((T, PHON_LAYOUT_V1_DIM), dtype=np.float32) if T else np.zeros((0, PHON_LAYOUT_V1_DIM), dtype=np.float32)
    pmask = np.zeros(T, dtype=np.float32)
    for i, ch in enumerate(letters):
        cl = ch.lower()
        is_v = cl in "aeiouy"
        is_first = i == 0
        is_last = i == T - 1
        wln = T / max_len
        feat[i, 0] = 1.0 if is_v else 0.0
        feat[i, 1] = 1.0 if is_first else 0.0
        feat[i, 2] = 1.0 if is_last else 0.0
        feat[i, 3] = wln
    rows: list[CharPhon] = []
    for i, ch in enumerate(letters):
        cl = ch.lower()
        is_v = cl in "aeiouy"
        rows.append(
            CharPhon(
                char_idx=i,
                char=ch,
                is_initial=i == 0,
                is_final=i == len(letters) - 1,
                is_vowel=is_v,
                word_len_norm=len(letters) / max_len,
                syllable_idx=0,
                is_in_stressed_syllable=False,
                distance_to_stress=0,
                same_vowel_repetition_local=_same_vowel_local(letters, i),
                prev_is_vowel=letters[i - 1].lower() in "aeiouy" if i > 0 else False,
                next_is_vowel=letters[i + 1].lower() in "aeiouy" if i < len(letters) - 1 else False,
                char_role_in_syllable="unknown",
                is_stressed_nucleus=False,
                syllable_position_from_start=0,
                syllable_position_from_end=0,
                is_primary_stress_syllable=False,
            )
        )
    return PronLayerOut(
        raw_text=raw,
        normalized_text=letters and "".join(letters) or "",
        letters=letters,
        char_rows=rows,
        syllable_count=0,
        stress_pattern="",
        pronunciation_source=pv,
        pronunciation_confidence=0.0,
        preprocessing_version=_DEFAULT_PREPROC_VERSION,
        feature_matrix=feat,
        phon_mask=pmask,
        cache_blob={},
    )


def enrich_word(
    word: str,
    *,
    preprocessing_version: str | None = None,
    max_len: int = 64,
) -> PronLayerOut:
    ver = preprocessing_version or _DEFAULT_PREPROC_VERSION
    if not (word and str(word).strip()):
        return _fallback_letters_and_features("", max_len, PronSource.FAILED.value)

    raw = str(word)
    letters = [c for c in raw.lower() if c.isalpha()]
    if not letters:
        return _fallback_letters_and_features(raw, max_len, PronSource.FAILED.value)

    lr = phones_for_word("".join(letters))
    if lr.source == PronSource.FAILED:
        return _fallback_letters_and_features("".join(letters), max_len, PronSource.FAILED.value)
    if lr.source == PronSource.FALLBACK or not (lr.phones and lr.phones.strip()):
        o = _fallback_letters_and_features("".join(letters), max_len, PronSource.FALLBACK.value)
        o.pronunciation_confidence = 0.0
        o.preprocessing_version = ver
        o.cache_blob = {"phones": ""}
        return o

    sw, sconf = syllabify_from_lookup(lr)
    stress = sw.stress_digits
    n_syl = sw.n_syl
    if n_syl == 0 or not stress:
        o = _fallback_letters_and_features("".join(letters), max_len, PronSource.FALLBACK.value)
        o.preprocessing_version = ver
        return o

    align = align_orthography("".join(letters), sw)
    if align is None:
        o = _fallback_letters_and_features("".join(letters), max_len, PronSource.FALLBACK.value)
        o.preprocessing_version = ver
        return o

    rows, feat, pmask = _build_rows_and_matrix(letters, align, n_syl, max_len, stress)
    conf = min(float(lr.confidence), float(sconf)) * (0.85 if n_syl != len([c for c in letters if c in "aeiouy"]) else 1.0)
    if conf > 1.0:
        conf = 1.0
    return PronLayerOut(
        raw_text=raw,
        normalized_text="".join(letters),
        letters=letters,
        char_rows=rows,
        syllable_count=n_syl,
        stress_pattern=stress_pattern_str(stress),
        pronunciation_source=lr.source.value,
        pronunciation_confidence=conf,
        preprocessing_version=ver,
        feature_matrix=feat,
        phon_mask=pmask,
        cache_blob={"phones": lr.phones},
    )
