"""Trainer's canonical 26-letter palette — source of truth for delta rebasing.

The trainer explicitly assigns one Lab color per letter (a–z).  All per-letter
predictions from the trainer's model are interpreted as:
    pred_lab = trainer_palette[letter] + structural_delta

When a user supplies their own 26-letter palette the rebasing is:
    user_final_lab = user_palette[letter] + structural_delta
                   = user_palette[letter] + (pred_lab - trainer_palette[letter])
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

Palette = dict[str, list[float]]  # letter → [L, a, b]


def _artifacts_root() -> Path:
    from app.services.artifact_paths import _artifacts_root as _root
    return _root()


def trainer_palette_path() -> Path:
    return _artifacts_root() / "trainer_palette.json"


def save_trainer_palette(palette: Palette) -> None:
    p = trainer_palette_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    cleaned = _clean_palette(palette)
    p.write_text(json.dumps(cleaned, indent=2, sort_keys=True))
    logger.info("trainer_palette saved (%d letters) → %s", len(cleaned), p)


def load_trainer_palette() -> Palette | None:
    p = trainer_palette_path()
    if not p.is_file():
        return None
    try:
        raw: Any = json.loads(p.read_text())
        if isinstance(raw, dict):
            return _clean_palette(raw)
    except Exception:
        logger.warning("Failed to load trainer_palette from %s", p, exc_info=True)
    return None


def _clean_palette(raw: dict[str, Any]) -> Palette:
    out: Palette = {}
    for k, v in raw.items():
        letter = str(k).lower().strip()
        if len(letter) != 1 or not letter.isalpha():
            continue
        if isinstance(v, (list, tuple)) and len(v) >= 3:
            try:
                out[letter] = [float(v[0]), float(v[1]), float(v[2])]
            except (TypeError, ValueError):
                pass
    return out
