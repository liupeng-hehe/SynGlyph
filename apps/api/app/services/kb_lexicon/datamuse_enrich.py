"""Datamuse-driven orthographic enrichment (uses existing datamuse client + policy)."""

from __future__ import annotations

from typing import Any

from app.services.pattern_supply.providers.datamuse_client import DatamuseError, query_words


def words_from_datamuse_query(
    *,
    sp: str | None = None,
    lc: str | None = None,
    rc: str | None = None,
    max_results: int = 200,
    md: str | None = None,
) -> list[str]:
    """
    Run one /words query; return single-token words only (skip phrases with spaces).

    Mode B (neighbor-targeted): pass ``lc`` / ``rc`` as left/right context hints together with ``sp`` when needed.
    """
    params: dict[str, str | int] = {"max": min(max(1, max_results), 1000)}
    if sp:
        params["sp"] = sp
    if lc:
        params["lc"] = lc
    if rc:
        params["rc"] = rc
    if md:
        params["md"] = md
    try:
        rows = query_words(params)
    except DatamuseError:
        return []
    out: list[str] = []
    for row in rows:
        w = row.get("word")
        if not isinstance(w, str):
            continue
        w2 = w.strip().lower()
        if " " in w2 or not w2:
            continue
        out.append(w2)
    return out


def default_enrichment_queries(max_per: int = 200) -> list[dict[str, Any]]:
    """Mode A suffix/prefix style wildcard patterns (v1 defaults)."""
    patterns = ["*ment", "*tion", "*ing", "un*", "re*", "th*"]
    return [{"sp": p, "max_results": max_per} for p in patterns]


def alphabet_sweep_queries(max_per_letter: int = 1000) -> list[dict[str, Any]]:
    """26 prefix wildcard queries (a* through z*) for broad vocabulary coverage."""
    return [{"sp": f"{c}*", "max_results": min(max_per_letter, 1000)} for c in "abcdefghijklmnopqrstuvwxyz"]


def words_from_alphabet_sweep(target_words: int = 5000) -> list[str]:
    """
    Query Datamuse with a* through z*, collect until we reach target_words unique words.
    Returns deduplicated lowercase words (no spaces, strict [a-z]+).
    """
    import string
    per_letter = max(200, min(1000, (target_words // 20) + 50))
    seen: set[str] = set()
    out: list[str] = []
    for letter in string.ascii_lowercase:
        if len(out) >= target_words:
            break
        words = words_from_datamuse_query(sp=f"{letter}*", max_results=per_letter)
        for w in words:
            if len(out) >= target_words:
                break
            if w not in seen and w.isalpha():
                seen.add(w)
                out.append(w)
    return out
