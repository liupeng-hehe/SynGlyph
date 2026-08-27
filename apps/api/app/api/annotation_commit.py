from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.annotation import AnnotationCommitRequest, AnnotationCommitResponse
from app.services.annotation_commit_service import on_annotation_committed

router = APIRouter(prefix="/api/annotation", tags=["annotation-commit"])


@router.post("/commit", response_model=AnnotationCommitResponse)
def annotation_commit(body: AnnotationCommitRequest, db: Session = Depends(get_db)):
    """Canonical path for annotation commit + registry closure (see also ``/api/annotations/commit``)."""
    return on_annotation_committed(db, body)
