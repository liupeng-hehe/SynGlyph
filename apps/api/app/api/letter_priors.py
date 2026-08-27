"""
Letter priors: on-demand aggregation of single-letter color associations from annotations.
Used for migrating prior annotations when starting a new word.
"""
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Annotation, Segmentation, Span, Stimulus

router = APIRouter(prefix="/api/letter-priors", tags=["letter-priors"])


@router.get("")
def get_letter_priors(
    dataset_ids: str | None = Query(None, description="Comma-separated dataset IDs; omit for all"),
    db: Session = Depends(get_db),
):
    """
    Aggregate single-letter (span_text length 1) color associations from annotations.
    Filter by dataset_id if dataset_ids provided.
    Returns: { "r": { avg_l, avg_a, avg_b, avg_prominence, avg_spread, count }, ... }
    """
    ids_filter = None
    if dataset_ids:
        ids_list = [x.strip() for x in dataset_ids.split(",") if x.strip()]
        if ids_list:
            ids_filter = ids_list

    q = (
        db.query(Span.span_text, Span.color_lab_l, Span.color_lab_a, Span.color_lab_b, Span.prominence, Span.spread)
        .join(Segmentation, Span.segmentation_id == Segmentation.id)
        .join(Annotation, Segmentation.annotation_id == Annotation.id)
        .join(Stimulus, Annotation.stimulus_id == Stimulus.id)
    )
    if ids_filter is not None:
        q = q.filter(Stimulus.dataset_id.in_(ids_filter))

    rows = q.all()
    by_letter: dict[str, list[dict]] = defaultdict(list)
    for span_text, l, a, b, prom, spread in rows:
        if not span_text or len(span_text) != 1:
            continue
        letter = span_text
        if letter.isalpha():
            by_letter[letter].append({
                "l": l or 50.0,
                "a": a or 0.0,
                "b": b or 0.0,
                "prominence": prom if prom is not None else 0.5,
                "spread": spread if spread is not None else 0.5,
            })

    result = {}
    for letter, occs in by_letter.items():
        if not occs:
            continue
        n = len(occs)
        result[letter] = {
            "avg_l": sum(o["l"] for o in occs) / n,
            "avg_a": sum(o["a"] for o in occs) / n,
            "avg_b": sum(o["b"] for o in occs) / n,
            "avg_prominence": sum(o["prominence"] for o in occs) / n,
            "avg_spread": sum(o["spread"] for o in occs) / n,
            "count": n,
        }
    return result
