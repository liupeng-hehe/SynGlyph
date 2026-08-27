"""Resolve champion deployment; strict semantics for multiple active rows."""

from __future__ import annotations

import logging
from sqlalchemy.orm import Session

from app.models.ml_deployment import MLDeployment

logger = logging.getLogger(__name__)


class AmbiguousActiveDeploymentError(RuntimeError):
    """More than one active deployment row for the same (env, product, task, alias)."""


def get_active_deployment(
    db: Session,
    *,
    environment: str,
    product_line: str,
    task_name: str,
    alias: str = "champion",
) -> MLDeployment | None:
    """
    Return the unique active deployment, or None if none.

    Raises ``AmbiguousActiveDeploymentError`` if more than one active row exists
    (application must not silently pick one).
    """
    rows = (
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
    if len(rows) == 0:
        return None
    if len(rows) == 1:
        return rows[0]
    logger.error(
        "multiple active ml_deployment rows env=%s product=%s task=%s alias=%s count=%s",
        environment,
        product_line,
        task_name,
        alias,
        len(rows),
    )
    raise AmbiguousActiveDeploymentError(
        f"multiple active deployments for {environment}/{product_line}/{task_name}/{alias}"
    )


def get_champion_snapshot_id(
    db: Session,
    *,
    environment: str,
    product_line: str,
    task_name: str,
    alias: str = "champion",
) -> str | None:
    dep = get_active_deployment(
        db,
        environment=environment,
        product_line=product_line,
        task_name=task_name,
        alias=alias,
    )
    return dep.model_snapshot_id if dep else None
