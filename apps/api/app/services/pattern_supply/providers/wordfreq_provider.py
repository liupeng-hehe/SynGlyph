from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=10_000)
def zipf_frequency_or_none(word: str) -> float | None:
    try:
        from wordfreq import zipf_frequency  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001
        return None
    try:
        return float(zipf_frequency(word, "en"))
    except Exception:  # noqa: BLE001
        return None

