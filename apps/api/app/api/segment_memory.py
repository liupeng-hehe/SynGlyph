import json
import uuid
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Annotation,
    Segmentation,
    Span,
    SegmentMemory,
    Stimulus,
)
from app.schemas.segment_memory import (
    SegmentMemoryResponse,
    SegmentMemoryMergeRequest,
    SegmentMemoryUpdateRequest,
)

router = APIRouter(prefix="/api/segment-memory", tags=["segment-memory"])


@router.get("", response_model=list[SegmentMemoryResponse])
def list_segment_memory(
    min_count: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(SegmentMemory)
        .filter(SegmentMemory.count >= min_count)
        .order_by(SegmentMemory.count.desc())
        .limit(limit)
        .all()
    )
    return [
        SegmentMemoryResponse(
            id=r.id,
            segment_text=r.segment_text,
            count=r.count,
            prefix_count=r.prefix_count,
            middle_count=r.middle_count,
            suffix_count=r.suffix_count,
            avg_l=r.avg_l,
            avg_a=r.avg_a,
            avg_b=r.avg_b,
            avg_prominence=r.avg_prominence,
            avg_spread=r.avg_spread,
            example_words=r.example_words,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.post("/refresh")
def refresh_segment_memory(db: Session = Depends(get_db)):
    """Mine segments from annotations and upsert into segment_memory."""
    from sqlalchemy.orm import joinedload

    anns = (
        db.query(Annotation)
        .options(
            joinedload(Annotation.segmentation).joinedload(Segmentation.spans),
            joinedload(Annotation.stimulus),
        )
        .all()
    )

    # Collect all span occurrences with word context
    by_text: dict[str, list[dict]] = defaultdict(list)
    for ann in anns:
        seg = ann.segmentation
        stim = ann.stimulus
        if not seg or not stim:
            continue
        word = stim.text
        for i, span in enumerate(seg.spans):
            pos = "prefix" if i == 0 else ("suffix" if i == len(ann.segmentation.spans) - 1 else "middle")
            by_text[span.span_text].append({
                "l": span.color_lab_l,
                "a": span.color_lab_a,
                "b": span.color_lab_b,
                "prominence": span.prominence,
                "spread": span.spread,
                "position": pos,
                "word": word,
            })

    # Upsert segment_memory
    existing = {r.segment_text: r for r in db.query(SegmentMemory).all()}
    for seg_text, occurrences in by_text.items():
        if len(occurrences) < 1:
            continue
        prefix_count = sum(1 for o in occurrences if o["position"] == "prefix")
        middle_count = sum(1 for o in occurrences if o["position"] == "middle")
        suffix_count = sum(1 for o in occurrences if o["position"] == "suffix")
        avg_l = sum(o["l"] for o in occurrences) / len(occurrences)
        avg_a = sum(o["a"] for o in occurrences) / len(occurrences)
        avg_b = sum(o["b"] for o in occurrences) / len(occurrences)
        avg_prom = sum(o["prominence"] for o in occurrences) / len(occurrences)
        avg_spr = sum(o["spread"] for o in occurrences) / len(occurrences)
        example_words = list(dict.fromkeys(o["word"] for o in occurrences))[:10]
        example_words_str = json.dumps(example_words)

        if seg_text in existing:
            row = existing[seg_text]
            row.count = len(occurrences)
            row.prefix_count = prefix_count
            row.middle_count = middle_count
            row.suffix_count = suffix_count
            row.avg_l = avg_l
            row.avg_a = avg_a
            row.avg_b = avg_b
            row.avg_prominence = avg_prom
            row.avg_spread = avg_spr
            row.example_words = example_words_str
        else:
            row = SegmentMemory(
                id=str(uuid.uuid4()),
                segment_text=seg_text,
                count=len(occurrences),
                prefix_count=prefix_count,
                middle_count=middle_count,
                suffix_count=suffix_count,
                avg_l=avg_l,
                avg_a=avg_a,
                avg_b=avg_b,
                avg_prominence=avg_prom,
                avg_spread=avg_spr,
                example_words=example_words_str,
            )
            db.add(row)
            existing[seg_text] = row

    db.commit()
    return {"mined": len(by_text), "total_occurrences": sum(len(v) for v in by_text.values())}


@router.patch("/{segment_id}", response_model=SegmentMemoryResponse | dict)
def update_segment_memory(
    segment_id: str,
    body: SegmentMemoryUpdateRequest,
    db: Session = Depends(get_db),
):
    row = db.query(SegmentMemory).filter(SegmentMemory.id == segment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Segment memory not found")
    if body.rejected is True:
        db.delete(row)
        db.commit()
        return {"deleted": segment_id}
    if body.segment_text is not None:
        row.segment_text = body.segment_text
    db.commit()
    db.refresh(row)
    return SegmentMemoryResponse(
        id=row.id,
        segment_text=row.segment_text,
        count=row.count,
        prefix_count=row.prefix_count,
        middle_count=row.middle_count,
        suffix_count=row.suffix_count,
        avg_l=row.avg_l,
        avg_a=row.avg_a,
        avg_b=row.avg_b,
        avg_prominence=row.avg_prominence,
        avg_spread=row.avg_spread,
        example_words=row.example_words,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/merge")
def merge_segment_memory(
    body: SegmentMemoryMergeRequest,
    db: Session = Depends(get_db),
):
    target = db.query(SegmentMemory).filter(SegmentMemory.id == body.target_segment_id).first()
    source = db.query(SegmentMemory).filter(SegmentMemory.id == body.source_segment_id).first()
    if not target or not source:
        raise HTTPException(status_code=404, detail="One or both segments not found")
    # Merge: add source counts to target, weight averages
    tc, sc = target.count, source.count
    total = tc + sc
    target.count = total
    target.prefix_count += source.prefix_count
    target.middle_count += source.middle_count
    target.suffix_count += source.suffix_count
    target.avg_l = (target.avg_l * tc + source.avg_l * sc) / total if total else target.avg_l
    target.avg_a = (target.avg_a * tc + source.avg_a * sc) / total if total else target.avg_a
    target.avg_b = (target.avg_b * tc + source.avg_b * sc) / total if total else target.avg_b
    target.avg_prominence = (target.avg_prominence * tc + source.avg_prominence * sc) / total if total else target.avg_prominence
    target.avg_spread = (target.avg_spread * tc + source.avg_spread * sc) / total if total else target.avg_spread
    t_ex = json.loads(target.example_words or "[]")
    s_ex = json.loads(source.example_words or "[]")
    target.example_words = json.dumps(list(dict.fromkeys(t_ex + s_ex))[:15])
    db.delete(source)
    db.commit()
    return {"merged_into": body.target_segment_id, "deleted": body.source_segment_id}
