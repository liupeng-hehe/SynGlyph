"""
Persist line-cut glyph segmentation JSON (v2) to the repo data folder — research / pipeline input,
not per-user color annotation.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import settings

router = APIRouter(prefix="/api/glyph-segments", tags=["glyph-segments"])


def _repo_root() -> Path:
    """apps/api/app/api/*.py -> SynGlyph repo root."""
    return Path(__file__).resolve().parents[4]


def _segments_root() -> Path:
    if settings.glyph_segments_root:
        return Path(settings.glyph_segments_root).expanduser().resolve()
    return _repo_root() / "data" / "glyph_segments"


def _is_en_lowercase_letter_a_to_z(glyph: str) -> bool:
    g = glyph.strip()
    return len(g) == 1 and "a" <= g <= "z"


def _safe_glyph_filename(glyph: str, script: str) -> str:
    g = glyph.strip()
    if not g or len(g) > 64:
        raise HTTPException(status_code=400, detail="invalid glyph")
    if ".." in g or "/" in g or "\\" in g or g.startswith("."):
        raise HTTPException(status_code=400, detail="invalid glyph")
    # English bucket: strict lowercase a–z only (graph-first product scope)
    if script == "en":
        if not _is_en_lowercase_letter_a_to_z(g):
            raise HTTPException(
                status_code=400,
                detail="English (en) glyph must be a single lowercase letter a–z",
            )
        return f"{g}.json"
    # Other scripts: allow broader identifiers
    if not re.fullmatch(r"[\w\u0080-\U0010ffff.-]+", g, re.UNICODE):
        raise HTTPException(status_code=400, detail="invalid glyph characters")
    return f"{g}.json"


class SaveGlyphSegmentResponse(BaseModel):
    ok: bool = True
    path: str = Field(..., description="Relative path under repo root for display / git")
    script: Literal["en", "zh"]


class ListGlyphSegmentsResponse(BaseModel):
    """Basenames (without .json) of saved segmentation files under data/glyph_segments/{script}/."""

    glyphs: list[str]


@router.get("", response_model=ListGlyphSegmentsResponse)
def list_glyph_segments(
    script: Literal["en", "zh"] = Query("en", description="Script bucket"),
):
    root = _segments_root() / script
    if not root.is_dir():
        return ListGlyphSegmentsResponse(glyphs=[])
    stems = [p.stem for p in root.glob("*.json")]
    if script == "en":
        stems = [s for s in stems if _is_en_lowercase_letter_a_to_z(s)]
    glyphs = sorted(stems)
    return ListGlyphSegmentsResponse(glyphs=glyphs)


@router.post("", response_model=SaveGlyphSegmentResponse)
def save_glyph_segment(
    body: dict[str, Any] = Body(...),
    script: Literal["en", "zh"] = Query("en", description="Script bucket: en (Latin etc.) or zh (Chinese)"),
):
    if body.get("version") != 2:
        raise HTTPException(status_code=400, detail="expected annotation JSON version 2")
    glyph = body.get("glyph")
    if not isinstance(glyph, str) or not glyph.strip():
        raise HTTPException(status_code=400, detail="missing glyph")

    fname = _safe_glyph_filename(glyph, script)
    root = _segments_root()
    sub = root / script
    sub.mkdir(parents=True, exist_ok=True)
    out = sub / fname

    text = json.dumps(body, indent=2, ensure_ascii=False) + "\n"
    out.write_text(text, encoding="utf-8")

    try:
        rel = out.relative_to(_repo_root())
        path_str = str(rel).replace("\\", "/")
    except ValueError:
        path_str = str(out)

    return SaveGlyphSegmentResponse(path=path_str, script=script)
