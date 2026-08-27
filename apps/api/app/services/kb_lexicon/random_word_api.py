"""Random Word API client (build-time only; batch random English words)."""

from __future__ import annotations

import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://random-word-api.herokuapp.com"


class RandomWordApiError(RuntimeError):
    pass


def fetch_random_words(
    *,
    number: int = 50,
    length: int | None = None,
    timeout_sec: float = 15.0,
    retries: int = 2,
) -> list[str]:
    """
    GET /word?number=N[&length=L]. Returns list of raw strings (may contain non-[a-z]).
    ``diff`` is not used (only applies when number<=5).
    """
    if number < 1:
        return []
    q = f"{BASE}/word?number={min(number, 100)}"
    if length is not None and length > 0:
        q += f"&length={int(length)}"
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = Request(q, headers={"User-Agent": "SynGlyph-KB-lexicon/1"})
            with urlopen(req, timeout=timeout_sec) as resp:  # noqa: S310
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                if isinstance(data, list):
                    return [str(x) for x in data if x is not None]
                if isinstance(data, str):
                    return [data]
                raise RandomWordApiError(f"unexpected payload: {type(data)}")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
            last = e
            if attempt < retries:
                time.sleep(0.4 * (attempt + 1))
                continue
            raise RandomWordApiError(str(e)) from last
    return []
