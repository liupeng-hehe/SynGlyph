"""Builtin English lexicon via wordfreq (optional dependency)."""

from __future__ import annotations

from app.services.kb_lexicon.entries import LexiconWordEntry, entry_from_parts
from app.services.kb_lexicon.normalize import merge_entries_keep_first, normalize_token_for_kb


def entries_from_wordfreq_topn(n: int = 5000) -> list[LexiconWordEntry]:
    """First ``n`` most common English tokens from wordfreq, strict [a-z]+ only."""
    try:
        from wordfreq import top_n_list  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001
        return []

    n = max(1, min(int(n), 100_000))
    words = top_n_list("en", n=n)
    rows: list[LexiconWordEntry] = []
    for i, w in enumerate(words):
        if not isinstance(w, str):
            continue
        nw = normalize_token_for_kb(w)
        if not nw:
            continue
        rows.append(
            entry_from_parts(
                normalized_word=nw,
                raw_word=w,
                rank=i + 1,
                entry_source_kind="builtin_provider",
                entry_source_name="wordfreq.top_n_list",
                entry_source_metadata={"lang": "en", "index": i},
            )
        )
    return merge_entries_keep_first(rows)
