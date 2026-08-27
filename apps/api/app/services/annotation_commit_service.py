"""Single implementation for annotation commit + registry + demand refresh."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.metric_fact import MetricFact
from app.schemas.annotation import AnnotationCommitRequest, AnnotationCommitResponse
from app.services.annotation_core import create_annotation_core
from app.services.pattern_supply.demand_profile import refresh_demand_profile
from app.services.pattern_supply.registry_store import upsert_registry_status


def on_annotation_committed(db: Session, body: AnnotationCommitRequest) -> AnnotationCommitResponse:
    ann = create_annotation_core(body, db, commit=False)
    upsert_registry_status(
        db,
        selected_list_id=body.selected_list_id,
        word=body.word,
        source="annotation_commit",
        status="annotated",
        annotation_version=body.annotation_version,
        notes=body.notes,
    )
    if body.edit_burden is not None:
        _upsert_edit_burden(db, ann.id, body.edit_burden)
    db.commit()
    refresh_demand_profile(
        db,
        selected_list_id=body.selected_list_id,
        force=True,
    )
    return AnnotationCommitResponse(
        annotation_id=ann.id,
        registry_status="annotated",
        excluded_future=True,
        selected_list_id=body.selected_list_id,
    )


def _upsert_edit_burden(db: Session, annotation_id: str, edit_burden: float) -> None:
    existing = (
        db.query(MetricFact)
        .filter(
            MetricFact.subject_type == "annotation",
            MetricFact.subject_id == annotation_id,
            MetricFact.metric_key == "edit_burden",
            MetricFact.comparison_kind == "none",
            MetricFact.baseline_name == "",
        )
        .first()
    )
    if existing:
        existing.metric_value = edit_burden
    else:
        db.add(
            MetricFact(
                id=str(uuid.uuid4()),
                subject_type="annotation",
                subject_id=annotation_id,
                metric_key="edit_burden",
                metric_value=edit_burden,
                metric_direction="down",
                unit="normalized",
                comparison_kind="none",
                baseline_name="",
            )
        )
