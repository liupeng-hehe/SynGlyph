"""Promote snapshot to active deployment alias (single transaction)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.ml_deployment import MLDeployment
from app.models.model_snapshot import ModelSnapshot


def promote_model_snapshot(
    db: Session,
    *,
    model_snapshot_id: str,
    environment: str,
    product_line: str,
    task_name: str,
    alias: str = "champion",
    dataset_version_id: str | None = None,
    notes: str | None = None,
) -> MLDeployment:
    snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == model_snapshot_id).first()
    if not snap:
        raise ValueError("model snapshot not found")

    q = (
        db.query(MLDeployment)
        .filter(
            MLDeployment.environment == environment,
            MLDeployment.product_line == product_line,
            MLDeployment.task_name == task_name,
            MLDeployment.alias == alias,
            MLDeployment.is_active.is_(True),
        )
        .all()
    )
    for row in q:
        row.is_active = False

    dep = MLDeployment(
        id=str(uuid.uuid4()),
        environment=environment,
        product_line=product_line,
        task_name=task_name,
        alias=alias,
        model_snapshot_id=model_snapshot_id,
        dataset_version_id=dataset_version_id or snap.dataset_version_id,
        is_active=True,
        notes=notes,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep
