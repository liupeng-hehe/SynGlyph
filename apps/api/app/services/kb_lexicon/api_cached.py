"""Parse previously saved API JSON (Datamuse-style or word list) into lexicon entries."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.kb_lexicon.entries import LexiconWordEntry, entry_from_parts
from app.services.kb_lexicon.normalize import merge_entries_keep_first, normalize_token_for_kb


def parse_api_cached_file(path: Path) -> list[LexiconWordEntry]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    words: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                words.append(item)
            elif isinstance(item, dict) and "word" in item:
                words.append(str(item.get("word") or ""))
    elif isinstance(raw, dict):
        if "words" in raw and isinstance(raw["words"], list):
            words = [str(x) for x in raw["words"]]
        elif "data" in raw and isinstance(raw["data"], list):
            for item in raw["data"]:
                if isinstance(item, dict) and "word" in item:
                    words.append(str(item.get("word") or ""))
    rows: list[LexiconWordEntry] = []
    for w in words:
        nw = normalize_token_for_kb(w)
        if not nw:
            continue
        rows.append(
            entry_from_parts(
                normalized_word=nw,
                raw_word=w,
                entry_source_kind="api_cached",
                entry_source_name=path.name,
                entry_source_metadata={"path": str(path.resolve())},
            )
        )
    return merge_entries_keep_first(rows)
