"""Shared raw-export dict for stimulus annotations (used by /api/stimuli/raw-export and dataset freeze)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models import Annotation, Segmentation, Stimulus


def get_raw_export_payload(db: Session, dataset_id: str | None) -> dict[str, Any]:
    q_stim = db.query(Stimulus).order_by(Stimulus.text)
    if dataset_id is not None:
        q_stim = q_stim.filter(Stimulus.dataset_id == dataset_id)
    else:
        q_stim = q_stim.filter(Stimulus.dataset_id.is_(None))
    stimuli = q_stim.all()

    stim_list = [
        {"id": s.id, "text": s.text, "language": s.language, "source_type": s.source_type}
        for s in stimuli
    ]

    anns = (
        db.query(Annotation)
        .options(
            joinedload(Annotation.stimulus),
            joinedload(Annotation.color_annotations),
        )
        .filter(Annotation.stimulus_id.in_([s.id for s in stimuli]))
        .all()
    )

    def ann_to_dict(ann: Annotation) -> dict[str, Any]:
        seg = db.query(Segmentation).filter(Segmentation.annotation_id == ann.id).first()
        spans = []
        if seg:
            for s in seg.spans:
                spans.append(
                    {
                        "id": s.id,
                        "span_text": s.span_text,
                        "span_order": s.span_order,
                        "color_lab": [s.color_lab_l, s.color_lab_a, s.color_lab_b],
                        "prominence": s.prominence,
                        "spread": s.spread,
                    }
                )
        boundary = None
        if seg and seg.boundary_influence_json:
            try:
                boundary = json.loads(seg.boundary_influence_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "id": ann.id,
            "stimulus_id": ann.stimulus_id,
            "created_at": ann.created_at.isoformat() if ann.created_at else None,
            "raw_input": seg.raw_input if seg else None,
            "spans": spans,
            "boundary_influence": boundary,
        }

    annotated = {a.stimulus_id: ann_to_dict(a) for a in anns}

    return {"stimuli": stim_list, "annotated": annotated}
