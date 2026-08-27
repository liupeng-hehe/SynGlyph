"""Compute the same 4 legacy channels as LetterSequenceBiLSTM._extra_features (no torch)."""

from __future__ import annotations

import numpy as np


def _char_to_id(ch: str) -> int:
    if len(ch) != 1:
        return 1
    o = ord(ch.lower())
    if ord("a") <= o <= ord("z"):
        return o - ord("a") + 2
    return UNK_IDX


def legacy_extra_features_numpy(letters: list[str], max_len: int = 64) -> np.ndarray:
    """[T, 4]: is_vowel, is_first, is_last, norm_len."""
    vowels = {ord(c) - ord("a") + 2 for c in "aeiou"}
    L = len(letters)
    out = np.zeros((L, 4), dtype=np.float32)
    if L == 0:
        return out
    ids = [_char_to_id(c) for c in letters]
    total = max(float(L), 1.0)
    for t in range(L):
        out[t, 0] = 1.0 if ids[t] in vowels else 0.0
        out[t, 1] = 1.0 if t == 0 else 0.0
        out[t, 2] = 1.0 if t == L - 1 else 0.0
        out[t, 3] = float(L) / float(max_len)
    return out
