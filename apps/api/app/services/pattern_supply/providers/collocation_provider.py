from __future__ import annotations

import time

from app.config.pattern_supply import COLLOCATION_POLICY

_CACHE: dict[str, tuple[float, dict[str, object]]] = {}


def collocation_metadata(word: str, *, topic_hints: list[str] | None = None) -> dict[str, object]:
    cache_key = f"{word}|{'/'.join(topic_hints or [])}"
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) <= COLLOCATION_POLICY.cache_ttl_seconds:
        return cached[1]

    w = word.lower()
    # Deterministic lightweight fallback; replaceable by corpus provider.
    bi = [w[i : i + 2] for i in range(max(0, len(w) - 1))]
    tri = [w[i : i + 3] for i in range(max(0, len(w) - 2))]
    payload: dict[str, object] = {
        "units": sorted(set(bi[:3] + tri[:2])),
        "provider": "local_fallback",
        "topic_hints": topic_hints or [],
    }
    _CACHE[cache_key] = (time.time(), payload)
    return payload

