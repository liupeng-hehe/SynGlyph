"""In-process LRU cache for PronLayerOut (key = normalized word + preprocessing version)."""

from __future__ import annotations

from collections import OrderedDict
from letter_sequence.phonology.enrich import PronLayerOut, enrich_word

# Optional API hook: replace with SQL-backed get/set
_global_cache: OrderedDict[str, PronLayerOut] = OrderedDict()
_MAX = 20_000


def cache_key(word: str, preprocessing_version: str) -> str:
    w = "".join(c for c in (word or "").lower() if c.isalpha())
    return f"{preprocessing_version}\n{w}"


def get_cached(word: str, preprocessing_version: str) -> PronLayerOut | None:
    k = cache_key(word, preprocessing_version)
    o = _global_cache.get(k)
    if o is None:
        return None
    _global_cache.move_to_end(k, last=True)
    return o


def set_cached(word: str, preprocessing_version: str, out: PronLayerOut) -> None:
    k = cache_key(word, preprocessing_version)
    _global_cache[k] = out
    _global_cache.move_to_end(k, last=True)
    while len(_global_cache) > _MAX:
        _global_cache.popitem(last=False)


def get_or_enrich(
    word: str,
    *,
    preprocessing_version: str,
    use_cache: bool = True,
) -> PronLayerOut:
    if use_cache:
        c = get_cached(word, preprocessing_version)
        if c is not None:
            return c
    out = enrich_word(word, preprocessing_version=preprocessing_version)
    if use_cache:
        set_cached(word, preprocessing_version, out)
    return out
