from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.pattern_supply import (
    RebuildActivateRequest,
    RebuildActivateResponse,
    RebuildStartRequest,
    RebuildStartResponse,
    RebuildStatusResponse,
)
from app.services.pattern_supply.offline_index_store import (
    activate_version,
    active_version_row,
    get_rebuild_job,
    run_rebuild_job,
    start_manual_rebuild,
)

router = APIRouter(prefix="/api/pattern-supply/rebuild", tags=["pattern-supply-rebuild"])


@router.post("/start", response_model=RebuildStartResponse)
def rebuild_start(body: RebuildStartRequest, db: Session = Depends(get_db)):
    job = start_manual_rebuild(
        db,
        corpus_path=body.corpus_path,
        corpus_name=body.corpus_name,
        version_label=body.version_label,
    )
    job = run_rebuild_job(db, job_id=job.id)
    if body.activate_after_build and job.status == "succeeded":
        version = _job_version(db, job.id)
        if version:
            activate_version(db, version=version)
    return RebuildStartResponse(
        job_id=job.id,
        version=_job_version(db, job.id) or "",
        status=job.status,
        message=job.message or "",
    )


@router.get("/status", response_model=RebuildStatusResponse)
def rebuild_status(job_id: str = Query(...), db: Session = Depends(get_db)):
    job = get_rebuild_job(db, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="rebuild job not found")
    active = active_version_row(db)
    return RebuildStatusResponse(
        job_id=job.id,
        status=job.status,
        corpus_name=job.corpus_name,
        version=_job_version(db, job.id),
        active_version=active.version if active else None,
        message=job.message,
        stats=json.loads(job.stats_json or "{}"),
    )


@router.post("/activate", response_model=RebuildActivateResponse)
def rebuild_activate(body: RebuildActivateRequest, db: Session = Depends(get_db)):
    ok = activate_version(db, version=body.version)
    if not ok:
        raise HTTPException(status_code=404, detail="offline index version not found")
    return RebuildActivateResponse(activated=True, version=body.version)


def _job_version(db: Session, job_id: str) -> str | None:
    job = get_rebuild_job(db, job_id=job_id)
    if job is None or not job.version_id:
        return None
    from app.models.offline_index_version import OfflineIndexVersion

    row = db.query(OfflineIndexVersion).filter(OfflineIndexVersion.id == job.version_id).first()
    return row.version if row else None

