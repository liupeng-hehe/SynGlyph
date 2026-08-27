"""English annotation product API — /api/english/* (isolated from Chinese)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.english import (
    EnglishAnnotationSession,
    EnglishSegment,
    EnglishTransition,
    EnglishWordInstance,
)

router = APIRouter(prefix="/api/english", tags=["english"])


class EnglishSessionCreate(BaseModel):
    word_text: str | None = None


class EnglishSegmentCreate(BaseModel):
    word_instance_id: str
    sort_order: int = 0
    label: str | None = None
    color_json: dict[str, Any] = Field(default_factory=dict)
    transform_json: dict[str, Any] | None = None


class EnglishSegmentPatch(BaseModel):
    sort_order: int | None = None
    label: str | None = None
    color_json: dict[str, Any] | None = None
    transform_json: dict[str, Any] | None = None


class EnglishTransitionCreate(BaseModel):
    word_instance_id: str
    source_segment_id: str
    target_segment_id: str
    strength: float = 1.0
    width: float = 0.2
    falloff: float = 0.5
    curve_json: dict[str, Any] | None = None
    blend_mode: str | None = None


class EnglishTransitionPatch(BaseModel):
    strength: float | None = None
    width: float | None = None
    falloff: float | None = None
    curve_json: dict[str, Any] | None = None
    blend_mode: str | None = None


def _seg_to_dict(s: EnglishSegment) -> dict[str, Any]:
    return {
        "id": s.id,
        "word_instance_id": s.word_instance_id,
        "sort_order": s.sort_order,
        "label": s.label,
        "color_json": json.loads(s.color_json or "{}"),
        "transform_json": json.loads(s.transform_json) if s.transform_json else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _tr_to_dict(t: EnglishTransition) -> dict[str, Any]:
    return {
        "id": t.id,
        "word_instance_id": t.word_instance_id,
        "source_segment_id": t.source_segment_id,
        "target_segment_id": t.target_segment_id,
        "strength": t.strength,
        "width": t.width,
        "falloff": t.falloff,
        "curve_json": json.loads(t.curve_json) if t.curve_json else None,
        "blend_mode": t.blend_mode,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _session_to_dict(sess: EnglishAnnotationSession, db: Session) -> dict[str, Any]:
    words = db.query(EnglishWordInstance).filter(EnglishWordInstance.session_id == sess.id).all()
    out_words = []
    for w in words:
        segs = db.query(EnglishSegment).filter(EnglishSegment.word_instance_id == w.id).order_by(EnglishSegment.sort_order).all()
        trs = db.query(EnglishTransition).filter(EnglishTransition.word_instance_id == w.id).all()
        out_words.append(
            {
                "id": w.id,
                "word_text": w.word_text,
                "segments": [_seg_to_dict(s) for s in segs],
                "transitions": [_tr_to_dict(t) for t in trs],
            }
        )
    return {
        "id": sess.id,
        "created_at": sess.created_at.isoformat() if sess.created_at else None,
        "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
        "word_instances": out_words,
    }


@router.get("/health")
def english_health():
    return {"product": "english", "status": "ok"}


@router.post("/session")
def create_english_session(body: EnglishSessionCreate, db: Session = Depends(get_db)):
    sid = str(uuid.uuid4())
    sess = EnglishAnnotationSession(id=sid)
    db.add(sess)
    db.flush()
    if body.word_text:
        wid = str(uuid.uuid4())
        db.add(EnglishWordInstance(id=wid, session_id=sid, word_text=body.word_text))
    db.commit()
    db.refresh(sess)
    return _session_to_dict(sess, db)


@router.get("/session/{session_id}")
def get_english_session(session_id: str, db: Session = Depends(get_db)):
    sess = db.query(EnglishAnnotationSession).filter(EnglishAnnotationSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_dict(sess, db)


@router.post("/segment")
def create_english_segment(body: EnglishSegmentCreate, db: Session = Depends(get_db)):
    w = db.query(EnglishWordInstance).filter(EnglishWordInstance.id == body.word_instance_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Word instance not found")
    sid = str(uuid.uuid4())
    seg = EnglishSegment(
        id=sid,
        word_instance_id=body.word_instance_id,
        sort_order=body.sort_order,
        label=body.label,
        color_json=json.dumps(body.color_json),
        transform_json=json.dumps(body.transform_json) if body.transform_json is not None else None,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return _seg_to_dict(seg)


@router.patch("/segment/{segment_id}")
def patch_english_segment(segment_id: str, body: EnglishSegmentPatch, db: Session = Depends(get_db)):
    seg = db.query(EnglishSegment).filter(EnglishSegment.id == segment_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    if body.sort_order is not None:
        seg.sort_order = body.sort_order
    if body.label is not None:
        seg.label = body.label
    if body.color_json is not None:
        seg.color_json = json.dumps(body.color_json)
    if body.transform_json is not None:
        seg.transform_json = json.dumps(body.transform_json)
    db.commit()
    db.refresh(seg)
    return _seg_to_dict(seg)


@router.delete("/segment/{segment_id}")
def delete_english_segment(segment_id: str, db: Session = Depends(get_db)):
    seg = db.query(EnglishSegment).filter(EnglishSegment.id == segment_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    db.delete(seg)
    db.commit()
    return {"ok": True}


@router.post("/transition")
def create_english_transition(body: EnglishTransitionCreate, db: Session = Depends(get_db)):
    w = db.query(EnglishWordInstance).filter(EnglishWordInstance.id == body.word_instance_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Word instance not found")
    tid = str(uuid.uuid4())
    tr = EnglishTransition(
        id=tid,
        word_instance_id=body.word_instance_id,
        source_segment_id=body.source_segment_id,
        target_segment_id=body.target_segment_id,
        strength=body.strength,
        width=body.width,
        falloff=body.falloff,
        curve_json=json.dumps(body.curve_json) if body.curve_json else None,
        blend_mode=body.blend_mode,
    )
    db.add(tr)
    db.commit()
    db.refresh(tr)
    return _tr_to_dict(tr)


@router.patch("/transition/{transition_id}")
def patch_english_transition(transition_id: str, body: EnglishTransitionPatch, db: Session = Depends(get_db)):
    tr = db.query(EnglishTransition).filter(EnglishTransition.id == transition_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail="Transition not found")
    if body.strength is not None:
        tr.strength = body.strength
    if body.width is not None:
        tr.width = body.width
    if body.falloff is not None:
        tr.falloff = body.falloff
    if body.curve_json is not None:
        tr.curve_json = json.dumps(body.curve_json)
    if body.blend_mode is not None:
        tr.blend_mode = body.blend_mode
    db.commit()
    db.refresh(tr)
    return _tr_to_dict(tr)


@router.delete("/transition/{transition_id}")
def delete_english_transition(transition_id: str, db: Session = Depends(get_db)):
    tr = db.query(EnglishTransition).filter(EnglishTransition.id == transition_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail="Transition not found")
    db.delete(tr)
    db.commit()
    return {"ok": True}
