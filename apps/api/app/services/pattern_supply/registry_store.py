from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.user_word_registry import UserWordRegistry
from app.services.pattern_supply.normalization import normalize_word


def upsert_registry_status(
    db: Session,
    *,
    selected_list_id: str,
    word: str,
    source: str,
    status: str,
    annotation_version: str | None = None,
    notes: str | None = None,
) -> UserWordRegistry:
    normalized = normalize_word(word)
    row = (
        db.query(UserWordRegistry)
        .filter(
            UserWordRegistry.selected_list_id == selected_list_id,
            UserWordRegistry.normalized_word == normalized,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if row is None:
        row = UserWordRegistry(
            id=str(uuid.uuid4()),
            selected_list_id=selected_list_id,
            word=word,
            normalized_word=normalized,
            source=source,
            status=status,
            first_seen_at=now,
            selected_at=now if status == "selected" else None,
            annotated_at=now if status == "annotated" else None,
            annotation_version=annotation_version,
            notes=notes,
        )
        db.add(row)
        return row

    row.word = word
    row.source = source
    row.status = status
    if status == "selected" and row.selected_at is None:
        row.selected_at = now
    if status == "annotated":
        row.annotated_at = now
        row.selected_at = row.selected_at or now
    if annotation_version:
        row.annotation_version = annotation_version
    if notes is not None:
        row.notes = notes
    return row

