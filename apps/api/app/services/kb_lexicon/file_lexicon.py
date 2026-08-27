"""Parse local lexicon files (txt lines; optional csv/json minimal)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from app.services.kb_lexicon.entries import LexiconWordEntry, entry_from_parts
from app.services.kb_lexicon.normalize import merge_entries_keep_first, normalize_token_for_kb


def parse_lexicon_text_lines(text: str, *, entry_source_name: str = "lexicon_text") -> list[LexiconWordEntry]:
    entries: list[LexiconWordEntry] = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        nw = normalize_token_for_kb(s)
        if not nw:
            continue
        entries.append(
            entry_from_parts(
                normalized_word=nw,
                raw_word=s,
                entry_source_kind="lexicon_file",
                entry_source_name=entry_source_name,
            )
        )
    return merge_entries_keep_first(entries)


def parse_lexicon_file(path: Path) -> list[LexiconWordEntry]:
    suf = path.suffix.lower()
    if suf in (".txt", ""):
        return parse_lexicon_text_lines(path.read_text(encoding="utf-8"), entry_source_name=path.name)
    if suf == ".csv":
        rows: list[LexiconWordEntry] = []
        with path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                w = (row.get("word") or row.get("text") or "").strip()
                nw = normalize_token_for_kb(w)
                if nw:
                    rows.append(
                        entry_from_parts(
                            normalized_word=nw,
                            raw_word=w,
                            entry_source_kind="lexicon_file",
                            entry_source_name=path.name,
                        )
                    )
        return merge_entries_keep_first(rows)
    if suf == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        words: list[str] = []
        if isinstance(data, list):
            words = [str(x) for x in data]
        elif isinstance(data, dict) and "words" in data:
            words = [str(x) for x in data["words"]]
        lines = "\n".join(words)
        return parse_lexicon_text_lines(lines, entry_source_name=path.name)
    raise ValueError(f"unsupported lexicon file type: {suf}")
