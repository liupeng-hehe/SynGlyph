import re
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Stimulus
from app.models.user_word_registry import UserWordRegistry
from app.schemas.stimulus import CreateStimulusRequest, StimulusResponse
from app.services.pattern_supply.normalization import normalize_word
from app.services.pattern_supply.registry_store import upsert_registry_status
from app.services.english_word_casing import normalize_word_for_stimulus_text

router = APIRouter(prefix="/api/stimuli", tags=["stimuli"])


class BulkImportRequest(BaseModel):
    text: str
    language: str = "en"
    source_type: str = "bulk"
    dataset_id: str | None = None


class UpsertFromEvaluationRequest(BaseModel):
    text: str
    dataset_id: str | None = None
    language: str = "en"
    checkpoint_id: str | None = None
    save_mode: str | None = None
    review_outcome: str | None = None


def _extract_english_words(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]+(?:'[a-zA-Z]+)?", text)
    seen: set[str] = set()
    result: list[str] = []
    for w in words:
        w_lo = w.lower()
        if w_lo not in seen and len(w) > 0:
            seen.add(w_lo)
            result.append(normalize_word_for_stimulus_text(w))
    return result


@router.post("", response_model=StimulusResponse)
def create_stimulus(body: CreateStimulusRequest, db: Session = Depends(get_db)):
    stim = Stimulus(
        id=str(uuid.uuid4()),
        text=body.text,
        language=body.language,
        source_type=body.source_type,
        dataset_id=body.dataset_id,
    )
    db.add(stim)
    if body.dataset_id:
        upsert_registry_status(
            db,
            selected_list_id=body.dataset_id,
            word=body.text,
            source=body.source_type,
            status="selected",
        )
    db.commit()
    db.refresh(stim)
    return stim


@router.post("/bulk")
def bulk_import(body: BulkImportRequest, db: Session = Depends(get_db)):
    words = _extract_english_words(body.text)
    if not words:
        return {"created": 0, "skipped": 0, "words": []}
    word_lowers = list({w.lower() for w in words})
    q = db.query(Stimulus.text).filter(func.lower(Stimulus.text).in_(word_lowers))
    if body.dataset_id is not None:
        q = q.filter(Stimulus.dataset_id == body.dataset_id)
    else:
        q = q.filter(Stimulus.dataset_id.is_(None))
    existing_rows = q.all()
    existing_lower = {r[0].lower() for r in existing_rows}
    created = 0
    for w in words:
        if w.lower() in existing_lower:
            if body.dataset_id:
                upsert_registry_status(
                    db,
                    selected_list_id=body.dataset_id,
                    word=w,
                    source=body.source_type,
                    status="selected",
                )
            continue
        stim = Stimulus(
            id=str(uuid.uuid4()),
            text=w,
            language=body.language,
            source_type=body.source_type,
            dataset_id=body.dataset_id,
        )
        db.add(stim)
        existing_lower.add(w.lower())
        created += 1
        if body.dataset_id:
            upsert_registry_status(
                db,
                selected_list_id=body.dataset_id,
                word=w,
                source=body.source_type,
                status="selected",
            )
    db.commit()
    return {"created": created, "skipped": len(words) - created, "words": words}


@router.post("/upsert-from-evaluation")
def upsert_from_evaluation(body: UpsertFromEvaluationRequest, db: Session = Depends(get_db)):
    """
    Upsert words from evaluation workflow into stimulus.

    Dedup key: lower(text) within the selected dataset scope.
    Source type is fixed to ``evaluation_upsert`` for downstream analytics.
    """
    words = _extract_english_words(body.text or "")
    if not words:
        return {
            "created": 0,
            "existing": 0,
            "created_words": [],
            "existing_words": [],
            "dataset_id": body.dataset_id,
        }

    word_lowers = list({w.lower() for w in words})
    q = db.query(Stimulus.text).filter(func.lower(Stimulus.text).in_(word_lowers))
    if body.dataset_id is not None:
        q = q.filter(Stimulus.dataset_id == body.dataset_id)
    else:
        q = q.filter(Stimulus.dataset_id.is_(None))
    existing_rows = q.all()
    existing_lower = {r[0].lower() for r in existing_rows}

    created_words: list[str] = []
    existing_words: list[str] = []

    for w in words:
        wl = w.lower()
        if wl in existing_lower:
            existing_words.append(w)
            if body.dataset_id:
                upsert_registry_status(
                    db,
                    selected_list_id=body.dataset_id,
                    word=w,
                    source="evaluation_upsert",
                    status="selected",
                )
            continue
        db.add(
            Stimulus(
                id=str(uuid.uuid4()),
                text=w,
                language=body.language,
                source_type="evaluation_upsert",
                dataset_id=body.dataset_id,
            )
        )
        existing_lower.add(wl)
        created_words.append(w)
        if body.dataset_id:
            upsert_registry_status(
                db,
                selected_list_id=body.dataset_id,
                word=w,
                source="evaluation_upsert",
                status="selected",
            )

    db.commit()
    return {
        "created": len(created_words),
        "existing": len(existing_words),
        "created_words": created_words,
        "existing_words": existing_words,
        "dataset_id": body.dataset_id,
    }


class AnnotatedSummaryItem(BaseModel):
    stimulus_id: str
    text: str
    whole_word_hex: str


@router.get("/annotated-summary", response_model=list[AnnotatedSummaryItem])
def list_annotated_summary(dataset_id: str | None = None, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    from app.models import Annotation
    q = (
        db.query(Annotation)
        .options(joinedload(Annotation.color_annotations), joinedload(Annotation.stimulus))
        .order_by(Annotation.created_at.desc())
    )
    if dataset_id is not None:
        q = q.join(Stimulus, Annotation.stimulus_id == Stimulus.id).filter(
            Stimulus.dataset_id == dataset_id
        )
    anns = q.all()
    seen: set[str] = set()
    result: list[AnnotatedSummaryItem] = []
    for ann in anns:
        if ann.stimulus_id in seen:
            continue
        if dataset_id is not None and ann.stimulus and ann.stimulus.dataset_id != dataset_id:
            continue
        seen.add(ann.stimulus_id)
        c = next(
            (ca for ca in ann.color_annotations if ca.target_type == "whole_word"),
            None,
        )
        if c and ann.stimulus:
            result.append(
                AnnotatedSummaryItem(
                    stimulus_id=ann.stimulus_id,
                    text=ann.stimulus.text,
                    whole_word_hex=(c.hex_color or "E0E0E0").replace("#", ""),
                )
            )
    return result


@router.get("/annotated-ids")
def list_annotated_stimulus_ids(dataset_id: str | None = None, db: Session = Depends(get_db)):
    from app.models import Annotation
    q = db.query(Annotation.stimulus_id).distinct()
    if dataset_id is not None:
        q = q.join(Stimulus, Annotation.stimulus_id == Stimulus.id).filter(
            Stimulus.dataset_id == dataset_id
        )
    rows = q.all()
    return {"stimulus_ids": [r[0] for r in rows]}


class CountSummary(BaseModel):
    total: int
    annotated: int


@router.get("/raw-export")
def get_raw_export(dataset_id: str | None = None, db: Session = Depends(get_db)):
    """Return raw data for current dataset: stimuli + annotations (for notebook preview)."""
    from app.services.raw_export_payload import get_raw_export_payload

    return get_raw_export_payload(db, dataset_id)


@router.get("/count-summary", response_model=CountSummary)
def get_count_summary(
    dataset_id: str | None = None,
    include_all: bool = False,
    db: Session = Depends(get_db),
):
    from app.models import Annotation
    q_total = db.query(Stimulus)
    if include_all:
        pass
    elif dataset_id is not None:
        q_total = q_total.filter(Stimulus.dataset_id == dataset_id)
    else:
        q_total = q_total.filter(Stimulus.dataset_id.is_(None))
    total = q_total.count()
    ann_stim_ids = db.query(Annotation.stimulus_id).distinct().subquery()
    q_ann = (
        db.query(Stimulus.id)
        .filter(Stimulus.id.in_(db.query(ann_stim_ids)))
    )
    if include_all:
        pass
    elif dataset_id is not None:
        q_ann = q_ann.filter(Stimulus.dataset_id == dataset_id)
    else:
        q_ann = q_ann.filter(Stimulus.dataset_id.is_(None))
    annotated = q_ann.count()
    return CountSummary(total=total, annotated=annotated)


@router.get("", response_model=list[StimulusResponse])
def list_stimuli(
    dataset_id: str | None = None,
    limit: int = 5000,
    exclude_existing: bool = False,
    exclude_selected: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(Stimulus)
    if dataset_id is not None:
        q = q.filter(Stimulus.dataset_id == dataset_id)
    else:
        q = q.filter(Stimulus.dataset_id.is_(None))
    rows = list(q.order_by(Stimulus.created_at.desc()).limit(limit * 2).all())
    if not exclude_existing or dataset_id is None:
        return rows[:limit]
    status_set = ["annotated"]
    if exclude_selected:
        status_set.append("selected")
    excluded = {
        r[0]
        for r in db.query(UserWordRegistry.normalized_word)
        .filter(
            UserWordRegistry.selected_list_id == dataset_id,
            UserWordRegistry.status.in_(status_set),
        )
        .all()
    }
    out: list[Stimulus] = []
    for row in rows:
        if normalize_word(row.text) in excluded:
            continue
        out.append(row)
        if len(out) >= limit:
            break
    return out


@router.get("/{stimulus_id}", response_model=StimulusResponse)
def get_stimulus(stimulus_id: str, db: Session = Depends(get_db)):
    stim = db.query(Stimulus).filter(Stimulus.id == stimulus_id).first()
    if not stim:
        raise HTTPException(status_code=404, detail="Stimulus not found")
    return stim


@router.delete("/{stimulus_id}")
def delete_stimulus(stimulus_id: str, db: Session = Depends(get_db)):
    from app.models import Annotation
    stim = db.query(Stimulus).filter(Stimulus.id == stimulus_id).first()
    if not stim:
        raise HTTPException(status_code=404, detail="Stimulus not found")
    db.query(Annotation).filter(Annotation.stimulus_id == stimulus_id).delete()
    db.delete(stim)
    db.commit()
    return {"ok": True}
