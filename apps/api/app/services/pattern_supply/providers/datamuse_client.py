from __future__ import annotations

import json
import time
from urllib.parse import urlencode
from urllib.request import urlopen

from app.config.pattern_supply import DATAMUSE_POLICY

_CACHE: dict[str, tuple[float, list[dict[str, object]]]] = {}


class DatamuseError(RuntimeError):
    pass


def _cache_get(key: str) -> list[dict[str, object]] | None:
    row = _CACHE.get(key)
    if row is None:
        return None
    ts, payload = row
    if time.time() - ts > DATAMUSE_POLICY.cache_ttl_seconds:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: list[dict[str, object]]) -> None:
    _CACHE[key] = (time.time(), payload)


def query_words(params: dict[str, str | int]) -> list[dict[str, object]]:
    query = urlencode({k: v for k, v in params.items() if v is not None})
    cached = _cache_get(query)
    if cached is not None:
        return cached
    url = f"https://api.datamuse.com/words?{query}"
    attempt = 0
    backoffs = list(DATAMUSE_POLICY.backoff_ms)
    while True:
        attempt += 1
        try:
            with urlopen(url, timeout=DATAMUSE_POLICY.timeout_ms / 1000.0) as resp:  # noqa: S310
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                if not isinstance(data, list):
                    raise DatamuseError("unexpected datamuse payload")
                out = [x for x in data if isinstance(x, dict)]
                _cache_set(query, out)
                return out
        except Exception as exc:  # noqa: BLE001
            if attempt > DATAMUSE_POLICY.retries:
                raise DatamuseError(str(exc)) from exc
            idx = min(attempt - 1, len(backoffs) - 1)
            time.sleep(backoffs[idx] / 1000.0)

