"""Normalize and filter lexicon tokens for orthographic KB (strict [a-z]+ for v1)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.kb_lexicon.entries import LexiconWordEntry

_ALPHA_ONLY = re.compile(r"^[a-z]+$")


def is_kb_lexicon_token(s: str) -> bool:
    t = (s or "").strip().lower()
    return bool(t) and _ALPHA_ONLY.match(t) is not None


def normalize_token_for_kb(s: str) -> str | None:
    """Lowercase strip; return None if not strict [a-z]+."""
    t = (s or "").strip().lower()
    if _ALPHA_ONLY.match(t):
        return t
    return None


def merge_entries_keep_first(entries: list[LexiconWordEntry]) -> list[LexiconWordEntry]:
    """Dedupe by normalized_word; first occurrence wins."""
    seen: set[str] = set()
    out: list[LexiconWordEntry] = []
    for e in entries:
        nw = e.get("normalized_word") or ""
        if not nw or nw in seen:
            continue
        seen.add(nw)
        out.append(e)
    return out
