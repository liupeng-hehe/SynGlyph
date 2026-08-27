"""Load Chinese glyph templates from local MakeMeAHanzi-style JSON (one file per character)."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from app.db import settings
from app.utils.repo_root import get_repo_root

_graphics_lock = threading.Lock()
_graphics_index: dict[str, dict[str, Any]] | None = None
_graphics_index_built = False


def _glyph_dir() -> Path:
    if settings.chinese_glyph_data_root:
        return Path(settings.chinese_glyph_data_root).expanduser()
    return get_repo_root() / "data" / "chinese_glyphs"


def _graphics_txt_path() -> Path | None:
    """MakeMeAHanzi graphics.txt: newline-separated JSON per line, same schema as 福.json."""
    env = os.environ.get("CHINESE_GRAPHICS_TXT_PATH")
    if env:
        p = Path(env).expanduser()
        if p.is_file():
            return p
    candidate = _glyph_dir() / "graphics.txt"
    if candidate.is_file():
        return candidate
    return None


def _build_graphics_index() -> dict[str, dict[str, Any]]:
    """Parse graphics.txt once; map one Unicode char -> raw JSON object."""
    global _graphics_index, _graphics_index_built
    with _graphics_lock:
        if _graphics_index_built:
            return _graphics_index or {}
        _graphics_index_built = True
        path = _graphics_txt_path()
        if not path:
            _graphics_index = {}
            return {}
        idx: dict[str, dict[str, Any]] = {}
        try:
            with path.open(encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        raw = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    c = raw.get("character")
                    if isinstance(c, str) and len(c) == 1:
                        idx[c] = raw
        except OSError:
            _graphics_index = {}
            return {}
        _graphics_index = idx
        return idx


def normalize_glyph(raw: dict[str, Any], character: str) -> dict[str, Any] | None:
    """Ensure normalized keys: character, decomposition, matches, strokes, medians, rad_strokes."""
    char = raw.get("character")
    if not isinstance(char, str) or len(char) != 1:
        char = character
    strokes = raw.get("strokes")
    medians = raw.get("medians")
    if not isinstance(strokes, list) or not isinstance(medians, list):
        return None
    rad = raw.get("radStrokes") or raw.get("rad_strokes")
    if rad is not None and not isinstance(rad, list):
        rad = None
    return {
        "character": char,
        "decomposition": raw.get("decomposition"),
        "matches": raw.get("matches"),
        "strokes": strokes,
        "medians": medians,
        "rad_strokes": rad,
    }


def load_glyph_with_provenance(
    character: str,
) -> tuple[dict[str, Any] | None, str | None]:
    """
    Same resolution as ``load_glyph``, but also returns file source:
    ``local_json`` | ``graphics_txt`` | ``None`` if missing.
    """
    if not character or len(character) != 1:
        return None, None
    path = _glyph_dir() / f"{character}.json"
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None, None
        g = normalize_glyph(raw, character)
        return g, "local_json" if g else None

    raw = _build_graphics_index().get(character)
    if raw:
        g = normalize_glyph(raw, character)
        return g, "graphics_txt" if g else None
    return None, None


def load_glyph(character: str) -> dict[str, Any] | None:
    """
    Input: one Unicode character.
    Output: normalized glyph template dict or None if missing.

    Resolution order:
    1. {glyph_dir}/{char}.json (e.g. repo sample 福.json)
    2. MakeMeAHanzi graphics.txt index (download via scripts/download_chinese_graphics.py
       to data/chinese_glyphs/graphics.txt, or set CHINESE_GRAPHICS_TXT_PATH)
    """
    g, _ = load_glyph_with_provenance(character)
    return g
