from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.registry import RegistryCheckResponse
from app.services.pattern_supply.normalization import normalize_word
from app.services.pattern_supply.registry_filter import get_registry_row

router = APIRouter(prefix="/api/registry", tags=["registry"])


@router.get("/check", response_model=RegistryCheckResponse)
def registry_check(
    word: str = Query(..., min_length=1),
    selected_list_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    normalized = normalize_word(word)
    row = get_registry_row(db, selected_list_id=selected_list_id, word=word)
    if row is None:
        return RegistryCheckResponse(
            exists=False,
            word=word,
            normalized_word=normalized,
            selected_list_id=selected_list_id,
            status=None,
            first_seen_at=None,
            annotated_at=None,
            annotation_version=None,
        )
    return RegistryCheckResponse(
        exists=True,
        word=row.word,
        normalized_word=row.normalized_word,
        selected_list_id=row.selected_list_id,
        status=row.status,  # type: ignore[arg-type]
        first_seen_at=row.first_seen_at,
        annotated_at=row.annotated_at,
        annotation_version=row.annotation_version,
    )

