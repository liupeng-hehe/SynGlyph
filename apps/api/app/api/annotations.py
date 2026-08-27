import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Annotation,
    Segmentation,
)
from app.schemas.annotation import (
    CreateAnnotationRequest,
    AnnotationCommitRequest,
    AnnotationCommitResponse,
    AnnotationResponse,
    StimulusBriefResponse,
    SegmentationResponse,
    SpanResponse,
    ColorAnnotationResponse,
)
from app.services.annotation_commit_service import on_annotation_committed
from app.services.annotation_core import create_annotation_core

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.post("", response_model=AnnotationResponse)
def create_annotation(body: CreateAnnotationRequest, db: Session = Depends(get_db)):
    ann = create_annotation_core(body, db, commit=True)
    return _to_response(ann, db)


@router.post("/commit", response_model=AnnotationCommitResponse)
def commit_annotation(body: AnnotationCommitRequest, db: Session = Depends(get_db)):
    """Prefer ``POST /api/annotation/commit`` (same behavior); both are supported."""
    return on_annotation_committed(db, body)


@router.get("", response_model=list[AnnotationResponse])
def list_annotations(
    limit: int = 20,
    session_id: str | None = None,
    stimulus_id: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Annotation).order_by(Annotation.created_at.desc())
    if session_id:
        q = q.filter(Annotation.session_id == session_id)
    if stimulus_id:
        q = q.filter(Annotation.stimulus_id == stimulus_id)
    rows = q.limit(limit).all()
    return [_to_response(r, db) for r in rows]


@router.get("/{annotation_id}", response_model=AnnotationResponse)
def get_annotation(annotation_id: str, db: Session = Depends(get_db)):
    ann = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return _to_response(ann, db)


def _to_response(ann: Annotation, db: Session) -> AnnotationResponse:
    stim = ann.stimulus
    seg = db.query(Segmentation).filter(Segmentation.annotation_id == ann.id).first()
    spans = []
    if seg:
        spans = [
            SpanResponse(
                id=s.id,
                segmentation_id=s.segmentation_id,
                span_text=s.span_text,
                span_order=s.span_order,
                color_lab=[s.color_lab_l, s.color_lab_a, s.color_lab_b],
                prominence=s.prominence,
                spread=s.spread,
            )
            for s in seg.spans
        ]

    seg_resp = None
    if seg:
        boundary_influence = None
        if seg.boundary_influence_json:
            try:
                boundary_influence = json.loads(seg.boundary_influence_json)
            except (json.JSONDecodeError, TypeError):
                pass
        seg_resp = SegmentationResponse(
            id=seg.id,
            annotation_id=seg.annotation_id,
            raw_input=seg.raw_input,
            spans=spans,
            boundary_influence=boundary_influence,
        )

    color_resps = [
        ColorAnnotationResponse(
            id=c.id,
            annotation_id=c.annotation_id,
            target_type=c.target_type,
            span_id=c.span_id,
            hex_color=c.hex_color,
            color_order=c.color_order,
        )
        for c in ann.color_annotations
    ]

    return AnnotationResponse(
        id=ann.id,
        session_id=ann.session_id,
        stimulus_id=ann.stimulus_id,
        created_at=ann.created_at,
        stimulus=StimulusBriefResponse(
            id=stim.id,
            text=stim.text,
            language=stim.language,
            source_type=stim.source_type,
        ),
        segmentation=seg_resp,
        color_annotations=color_resps,
    )
