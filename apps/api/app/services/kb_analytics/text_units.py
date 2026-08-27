"""Character / n-gram extraction for KB orthographic patterns (configurable n, default 1..4, max 5)."""

from __future__ import annotations

import json
import re
from typing import Final

from app.config.kb_analytics import kb_ngram_max


def char_units(text: str) -> list[str]:
    return [c for c in (text or "").lower() if c.strip()]


def ngrams(chars: list[str], n: int) -> list[str]:
    if len(chars) < n:
        return []
    return ["".join(chars[i : i + n]) for i in range(0, len(chars) - n + 1)]


def pattern_key_char(c: str) -> str:
    return f"char:{c}"


def pattern_key_bg(bg: str) -> str:
    """Legacy 2-gram key (read compatibility only)."""
    return f"bg:{bg}"


def pattern_key_tg(tg: str) -> str:
    """Legacy 3-gram key (read compatibility only)."""
    return f"tg:{tg}"


def pattern_key_ngram(n: int, s: str) -> str:
    """Canonical n-gram pattern key for n >= 2."""
    return f"ng{n}:{s}"


_NGRAM_UT_RE: Final[re.Pattern[str]] = re.compile(r"^ngram_(\d+)$")


def n_from_unit_type(unit_type: str) -> int | None:
    """Return n for char (1), bigram/trigram (2/3), or ngram_k (k)."""
    if unit_type == "char":
        return 1
    if unit_type == "bigram":
        return 2
    if unit_type == "trigram":
        return 3
    m = _NGRAM_UT_RE.match(unit_type or "")
    if m:
        return int(m.group(1))
    return None


def pattern_key_prefix_for_unit_type(unit_type: str) -> str | None:
    """Prefix used in pattern_key strings for deficit / matching."""
    n = n_from_unit_type(unit_type)
    if n == 1:
        return "char:"
    if unit_type == "bigram":
        return "bg:"
    if unit_type == "trigram":
        return "tg:"
    if n is not None and n >= 2:
        return f"ng{n}:"
    return None


def candidate_pattern_keys(pattern_key: str) -> list[str]:
    """
    Candidate aliases for one query key, ordered by preference.

    This keeps API lookup compatible across snapshots that may store legacy keys
    (``bg:``, ``tg:``) or canonical keys (``ng2:``, ``ng3:``).
    """
    k = (pattern_key or "").strip().lower()
    if not k:
        return []
    out = [k]
    if k.startswith("ng2:"):
        out.append("bg:" + k[4:])
    elif k.startswith("ng3:"):
        out.append("tg:" + k[4:])
    elif k.startswith("bg:"):
        out.append("ng2:" + k[3:])
    elif k.startswith("tg:"):
        out.append("ng3:" + k[3:])
    # Deduplicate while preserving order.
    seen: set[str] = set()
    uniq: list[str] = []
    for item in out:
        if item not in seen:
            seen.add(item)
            uniq.append(item)
    return uniq


def all_pattern_keys_for_text(
    text: str,
    *,
    ngram_max: int | None = None,
    sp_vocab: "frozenset[str] | None" = None,
) -> dict[str, list[str]]:
    """
    Returns unit_type -> list of pattern_key strings.

    Uses morpheme-priority DP segmentation (segmenter.py) when available.
    Falls back to greedy longest-match if the segmenter cannot be imported.
    """
    nmax = kb_ngram_max() if ngram_max is None else max(2, min(5, int(ngram_max)))

    try:
        from app.services.kb_analytics.segmenter import SegmenterConfig, all_pattern_keys_morpheme
        cfg = SegmenterConfig(
            ngram_min=2,
            ngram_max=nmax,
            sp_vocab=sp_vocab if sp_vocab is not None else frozenset(),
        )
        return all_pattern_keys_morpheme(text, cfg)
    except Exception:
        pass

    # --- greedy fallback ---
    ch = char_units(text)
    L = len(ch)
    out: dict[str, list[str]] = {"char": [pattern_key_char(c) for c in ch]}
    if L < 2 or nmax < 2:
        return out
    covered = [False] * L
    for n in range(nmax, 1, -1):
        ut = f"ngram_{n}"
        keys: list[str] = []
        for i in range(L - n + 1):
            if not any(covered[i + j] for j in range(n)):
                gram = "".join(ch[i : i + n])
                keys.append(pattern_key_ngram(n, gram))
                for j in range(n):
                    covered[i + j] = True
        if keys:
            out[ut] = keys
    return out


def flatten_pattern_keys(keys_by_type: dict[str, list[str]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for ut, keys in keys_by_type.items():
        for k in keys:
            out.append((ut, k))
    return out


def positions_for_substring(haystack_chars: list[str], n: int, unit: str) -> list[int]:
    if len(unit) != n or len(haystack_chars) < n:
        return []
    starts: list[int] = []
    for i in range(0, len(haystack_chars) - n + 1):
        if "".join(haystack_chars[i : i + n]) == unit:
            starts.append(i)
    return starts


def _raw_from_pattern_key(unit_type: str, pattern_key: str) -> str:
    prefix = pattern_key_prefix_for_unit_type(unit_type)
    if prefix and pattern_key.startswith(prefix):
        return pattern_key[len(prefix) :]
    return pattern_key


def positions_json_for_pattern(text: str, unit_type: str, pattern_key: str) -> str:
    ch = char_units(text)
    raw = _raw_from_pattern_key(unit_type, pattern_key)
    n = n_from_unit_type(unit_type)
    if n == 1 and len(raw) == 1:
        idxs = [i for i, c in enumerate(ch) if c == raw]
    elif n is not None and n >= 2 and len(raw) == n:
        idxs = positions_for_substring(ch, n, raw)
    else:
        idxs = []
    return json.dumps(idxs)


def count_in_word_for_pattern(text: str, unit_type: str, pattern_key: str) -> int:
    data = json.loads(positions_json_for_pattern(text, unit_type, pattern_key))
    return len(data) if isinstance(data, list) else 0
