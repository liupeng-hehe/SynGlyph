"""Unified lexicon word entry contract (all providers normalize to this shape)."""

from __future__ import annotations

from typing import Any, TypedDict


class LexiconWordEntry(TypedDict, total=False):
    """Normalized row consumed by ``rebuild_kb_from_lexicon_entries``."""

    normalized_word: str
    raw_word: str
    rank: int | None
    frequency_score: float | None
    entry_source_kind: str
    entry_source_name: str
    entry_source_metadata: dict[str, Any]
    stimulus_id: str | None


def entry_from_parts(
    *,
    normalized_word: str,
    raw_word: str | None = None,
    rank: int | None = None,
    frequency_score: float | None = None,
    entry_source_kind: str = "unknown",
    entry_source_name: str = "",
    entry_source_metadata: dict[str, Any] | None = None,
    stimulus_id: str | None = None,
) -> LexiconWordEntry:
    nw = (normalized_word or "").strip()
    raw = (raw_word or nw).strip()
    out: LexiconWordEntry = {
        "normalized_word": nw,
        "raw_word": raw,
        "entry_source_kind": entry_source_kind,
        "entry_source_name": entry_source_name,
    }
    if rank is not None:
        out["rank"] = rank
    if frequency_score is not None:
        out["frequency_score"] = frequency_score
    if entry_source_metadata:
        out["entry_source_metadata"] = entry_source_metadata
    if stimulus_id:
        out["stimulus_id"] = stimulus_id
    return out
