"""
Morpheme-first two-pass segmenter for KB pattern extraction.

Pass 1 — morpheme extraction (n from large to small, left to right):
    Scan every position for known morphemes (prefixes, suffixes, or SP vocab).
    Lock matched positions so they can't be reused.

Pass 2 — gap fill (left to right, largest n-gram first):
    Any position not locked by Pass 1 is filled with the longest available
    n-gram, regardless of whether it is a morpheme.

This guarantees that "ture" in "pictures" is extracted before the smaller
"es" suffix can claim the overlapping position.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Curated morpheme lists  (2-4 chars, lowercase alpha only)
# ---------------------------------------------------------------------------

_PREFIXES: frozenset[str] = frozenset(
    [
        # 2-char
        "un", "re", "in", "im", "ir", "il", "de", "co", "en", "em",
        "ex", "bi", "by", "up", "ab", "ad", "be",
        # 3-char
        "dis", "mis", "non", "pre", "pro", "sub", "sup", "sur", "out",
        "mid", "uni", "tri", "per", "con", "com", "col", "cor",
        "for", "int",
        # 4-char
        "anti", "auto", "semi", "over", "post", "hypo", "fore",
        "tele", "mini", "poly", "omni", "self", "with", "intr",
    ]
)

_SUFFIXES: frozenset[str] = frozenset(
    [
        # 2-char
        "er", "ed", "es", "ly", "al", "ic", "fy", "en", "or", "ry",
        # 3-char
        "ing", "ion", "ous", "ful", "ish", "ive", "ary",
        "ory", "ery", "ism", "ist", "ity", "ize", "ise",
        "ent", "ant", "ate", "ify", "ily", "est",
        "nal", "ral", "ial", "ual", "age", "ure",
        # 4-char
        "tion", "sion", "ment", "ness", "ible", "able", "less",
        "ward", "wise", "most", "ling", "ster", "ture", "ship",
        "ance", "ence", "ious", "eous", "uous", "ical",
        "ular", "ized", "ised", "ated", "ened", "ered",
        "tion", "ness", "ment", "able", "ible",
    ]
)

_ALL_MORPHEMES: frozenset[str] = _PREFIXES | _SUFFIXES


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class SegmenterConfig:
    ngram_min: int = 2
    ngram_max: int = 4
    sp_vocab: frozenset[str] = field(default_factory=frozenset)


# ---------------------------------------------------------------------------
# Two-pass segmenter
# ---------------------------------------------------------------------------

def segment_word(word: str, cfg: SegmenterConfig) -> list[str]:
    """
    Segment *word* into non-overlapping pieces.

    Pass 1: scan n from cfg.ngram_max down to cfg.ngram_min, left to right.
            Lock any span whose text is a known morpheme or SP vocab item.
    Pass 2: fill remaining uncovered gaps left-to-right with the longest
            n-gram that fits (single char fallback if gap < ngram_min).
    """
    ch = [c for c in word.lower() if c.strip()]
    L = len(ch)
    if L == 0:
        return []

    nmin = cfg.ngram_min
    nmax = cfg.ngram_max
    covered = [False] * L
    morpheme_segs: list[tuple[int, str]] = []  # (start_pos, text)

    # -- Pass 1: morpheme extraction, largest n first -----------------------
    for n in range(min(nmax, L), nmin - 1, -1):
        for start in range(L - n + 1):
            end = start + n
            if any(covered[start:end]):
                continue
            seg = "".join(ch[start:end])
            if seg not in _ALL_MORPHEMES and seg not in cfg.sp_vocab:
                continue
            # 2-char morphemes are too ambiguous mid-word: only allow at
            # word-start (prefix) or word-end (suffix).
            if n == 2 and start != 0 and end != L:
                continue
            morpheme_segs.append((start, seg))
            covered[start:end] = [True] * n

    # -- Pass 2: fill uncovered gaps ----------------------------------------
    gap_segs: list[tuple[int, str]] = []
    i = 0
    while i < L:
        if covered[i]:
            i += 1
            continue
        # find end of contiguous uncovered run
        j = i
        while j < L and not covered[j]:
            j += 1
        # fill [i, j) with largest-first n-grams
        k = i
        while k < j:
            size = min(nmax, j - k)
            if size < nmin:
                gap_segs.append((k, ch[k]))  # single char
                k += 1
            else:
                gap_segs.append((k, "".join(ch[k : k + size])))
                k += size
        i = j

    # merge and return in word order
    all_segs = sorted(morpheme_segs + gap_segs, key=lambda x: x[0])
    return [s[1] for s in all_segs]


# ---------------------------------------------------------------------------
# Pattern key generation  (same key format as text_units.py)
# ---------------------------------------------------------------------------

def all_pattern_keys_morpheme(
    text: str,
    cfg: SegmenterConfig,
) -> dict[str, list[str]]:
    """Drop-in replacement for all_pattern_keys_for_text."""
    ch = [c for c in (text or "").lower() if c.strip()]
    if not ch:
        return {}

    out: dict[str, list[str]] = {"char": [f"char:{c}" for c in ch]}

    if cfg.ngram_max < cfg.ngram_min:
        return out

    for seg in segment_word(text, cfg):
        n = len(seg)
        if n < cfg.ngram_min or n > cfg.ngram_max:
            continue
        out.setdefault(f"ngram_{n}", []).append(f"ng{n}:{seg}")

    return out
