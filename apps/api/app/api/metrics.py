"""Read-only HITL metrics API (rollup via scripts/rollup_metrics.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.metrics_summary import build_metrics_summary, list_workflow_history

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/summary")
def get_metrics_summary(db: Session = Depends(get_db)):
    """Latest eval MAE, vs-previous improvement, workflow rates, experiment comparison sentences."""
    return build_metrics_summary(db)


@router.get("/workflow")
def get_workflow_history(db: Session = Depends(get_db), limit: int = 7):
    """Recent workflow metric snapshots (rolling windows from rollup)."""
    return {"rows": list_workflow_history(db, limit=min(max(limit, 1), 30))}
