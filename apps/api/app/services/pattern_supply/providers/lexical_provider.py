from __future__ import annotations

import time

from app.config.pattern_supply import LEXICAL_POLICY

_CACHE: dict[str, tuple[float, dict[str, object]]] = {}


def lexical_metadata(word: str) -> dict[str, object]:
    cached = _CACHE.get(word)
    if cached and (time.time() - cached[0]) <= LEXICAL_POLICY.cache_ttl_seconds:
        return cached[1]

    # Local lightweight lexical fallback; external dictionary provider can replace this without schema changes.
    meta: dict[str, object] = {
        "lemma": word.lower(),
        "pos_guess": _guess_pos(word),
        "definition": None,
        "dictionary_source": "local_fallback",
    }
    _CACHE[word] = (time.time(), meta)
    return meta


def _guess_pos(word: str) -> str | None:
    w = word.lower()
    if w.endswith("ing"):
        return "verb"
    if w.endswith("ly"):
        return "adverb"
    if w.endswith(("tion", "ness", "ment", "ity")):
        return "noun"
    if w.endswith(("ous", "ive", "al", "ful", "less")):
        return "adjective"
    return None

