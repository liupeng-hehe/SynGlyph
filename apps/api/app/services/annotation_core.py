"""Shared annotation persistence (legacy Stimulus / Annotation tables)."""

from __future__ import annotations

import json
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import (
    Annotation,
    Stimulus,
    Session as SessionModel,
    Segmentation,
    Span,
    ColorAnnotation,
)
from app.schemas.annotation import CreateAnnotationRequest
from app.utils.color import lab_to_hex


def create_annotation_core(body: CreateAnnotationRequest, db: Session, *, commit: bool) -> Annotation:
    session = db.query(SessionModel).filter(SessionModel.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    stimulus = db.query(Stimulus).filter(Stimulus.id == body.stimulus_id).first()
    if not stimulus:
        raise HTTPException(status_code=404, detail="Stimulus not found")

    concatenated = "".join(s.text_span for s in body.segments)
    if concatenated != stimulus.text:
        raise HTTPException(
            status_code=400,
            detail=f"Segments must cover stimulus text exactly. Got '{concatenated}', expected '{stimulus.text}'",
        )

    for ann in db.query(Annotation).filter(Annotation.stimulus_id == body.stimulus_id).all():
        db.delete(ann)

    ann_id = str(uuid.uuid4())
    ann = Annotation(id=ann_id, session_id=body.session_id, stimulus_id=body.stimulus_id)
    db.add(ann)

    raw_parts = [s.text_span for s in body.segments]
    raw_input = "|".join(raw_parts)
    seg_id = str(uuid.uuid4())
    boundary_json = json.dumps(body.boundary_influence) if body.boundary_influence else None
    seg = Segmentation(id=seg_id, annotation_id=ann_id, raw_input=raw_input, boundary_influence_json=boundary_json)
    db.add(seg)

    for i, seg_inp in enumerate(body.segments):
        L, a, b = seg_inp.color_lab[0], seg_inp.color_lab[1], seg_inp.color_lab[2]
        span = Span(
            id=str(uuid.uuid4()),
            segmentation_id=seg_id,
            span_text=seg_inp.text_span,
            span_order=i,
            color_lab_l=L,
            color_lab_a=a,
            color_lab_b=b,
            prominence=seg_inp.prominence,
            spread=seg_inp.spread,
        )
        db.add(span)

    first_lab = body.segments[0].color_lab
    hex_c = lab_to_hex(first_lab[0], first_lab[1], first_lab[2])
    whole_word_color = ColorAnnotation(
        id=str(uuid.uuid4()),
        annotation_id=ann_id,
        target_type="whole_word",
        span_id=None,
        hex_color=hex_c,
        color_order=0,
    )
    db.add(whole_word_color)
    if commit:
        db.commit()
    else:
        db.flush()
    db.refresh(ann)
    return ann
