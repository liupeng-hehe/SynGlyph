"""
Lowercase-only primitive graph storage (graph-first; not UMAP-based).

Canonical store for manual glyph topology: POST upserts the full GlyphGraphExportV1 JSON;
downstream (Graph lab, export/all, ml/scripts/glyph_graph_umap.py, etc.) should read from
here rather than re-deriving topology from font-only preprocessing.

Export JSON matches the web client's GlyphGraphExportV1 shape for GNN / training pipelines.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import GlyphGraphRecord

router = APIRouter(prefix="/api/glyph-graphs", tags=["glyph-graphs"])


def _validate_lowercase_en_char(char: str) -> str:
    if len(char) != 1:
        raise HTTPException(status_code=400, detail="char must be exactly one character")
    c = char.lower()
    if not ("a" <= c <= "z"):
        raise HTTPException(
            status_code=400,
            detail="Only lowercase English letters a–z are supported (no uppercase or mixed case)",
        )
    return c


@router.get("")
def list_glyph_graph_records(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.query(GlyphGraphRecord).order_by(GlyphGraphRecord.char).all()
    return {
        "chars": [r.char for r in rows],
        "items": [
            {
                "char": r.char,
                "id": r.id,
                "status": r.status,
                "image_width": r.image_width,
                "image_height": r.image_height,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
    }


@router.get("/export/all")
def export_all_graph_payloads(db: Session = Depends(get_db)) -> list[Any]:
    """Embedding-ready batch: one JSON object per saved letter (order by char)."""
    rows = db.query(GlyphGraphRecord).order_by(GlyphGraphRecord.char).all()
    return [json.loads(r.payload_json) for r in rows]


@router.get("/{char}")
def get_glyph_graph(char: str, db: Session = Depends(get_db)) -> Any:
    c = _validate_lowercase_en_char(char)
    row = db.query(GlyphGraphRecord).filter(GlyphGraphRecord.char == c).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No graph saved for '{c}'")
    return json.loads(row.payload_json)


@router.post("")
def upsert_glyph_graph(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    raw = body.get("char")
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="payload must include string field 'char'")
    c = _validate_lowercase_en_char(raw)
    if body.get("version") != 1:
        raise HTTPException(status_code=400, detail="expected payload.version == 1")

    img = body.get("image")
    iw = ih = None
    if isinstance(img, dict):
        iw = img.get("width")
        ih = img.get("height")
        if iw is not None:
            iw = int(iw)
        if ih is not None:
            ih = int(ih)

    payload_str = json.dumps(body, ensure_ascii=False)
    row = db.query(GlyphGraphRecord).filter(GlyphGraphRecord.char == c).first()
    if row is None:
        row = GlyphGraphRecord(
            id=str(uuid.uuid4()),
            char=c,
            payload_json=payload_str,
            status="ready",
            image_width=iw,
            image_height=ih,
        )
        db.add(row)
    else:
        row.payload_json = payload_str
        row.status = "ready"
        row.image_width = iw
        row.image_height = ih

    db.commit()
    db.refresh(row)
    return {"ok": True, "char": c, "id": row.id}
