import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Dataset, Stimulus, Session as SessionModel, Annotation, Segmentation, Span, ColorAnnotation
from app.schemas.dataset import DatasetCreate, DatasetResponse

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

ENGLISH_ALPHABET = [chr(c) for c in range(ord("a"), ord("z") + 1)]


@router.get("", response_model=list[DatasetResponse])
def list_datasets(
    owner: str | None = Query(None, description="Filter by owner (annotator id); required for scoped view"),
    db: Session = Depends(get_db),
):
    from app.models import Stimulus

    if owner is not None:
        rows = (
            db.query(Dataset)
            .filter(Dataset.owner == owner)
            .order_by(Dataset.created_at.desc())
            .all()
        )
    else:
        rows = db.query(Dataset).order_by(Dataset.created_at.desc()).all()

    if not rows and owner is not None:
        # No datasets for this owner yet - return empty (caller may create)
        return []
    if not rows:
        # Legacy: no owner filter, auto-create default for backward compat
        ds = Dataset(
            id=str(uuid.uuid4()),
            name="Default",
            owner="admin",
            is_canonical_root=False,
            import_source="legacy_default",
        )
        db.add(ds)
        db.commit()
        db.refresh(ds)
        db.query(Stimulus).filter(Stimulus.dataset_id.is_(None)).update(
            {Stimulus.dataset_id: ds.id}, synchronize_session=False
        )
        db.commit()
        return [ds]
    return rows


@router.post("", response_model=DatasetResponse)
def create_dataset(body: DatasetCreate, db: Session = Depends(get_db)):
    ds = Dataset(
        id=str(uuid.uuid4()),
        name=body.name,
        owner=body.owner,
        is_canonical_root=body.is_canonical_root,
        import_source=body.import_source or "manual",
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    # Always init with alphabet
    for letter in ENGLISH_ALPHABET:
        stim = Stimulus(
            id=str(uuid.uuid4()),
            dataset_id=ds.id,
            text=letter,
            language="en",
            source_type="alphabet_init",
        )
        db.add(stim)
    db.commit()
    # Optionally migrate letter colors from another dataset
    if body.migrate_from_dataset_id:
        db.refresh(ds)  # ensure stim are visible
        _import_alphabet_impl(db, ds.id, body.migrate_from_dataset_id)
    return ds


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


def _import_alphabet_impl(db: Session, dataset_id: str, source_dataset_id: str) -> int:
    """Shared impl for importing letter colors. Returns count imported."""
    from app.utils.color import lab_to_hex
    from app.models import Annotation as AnnModel, Segmentation as SegModel, Span as SpanModel

    rows = (
        db.query(SpanModel.span_text, SpanModel.color_lab_l, SpanModel.color_lab_a, SpanModel.color_lab_b, SpanModel.prominence, SpanModel.spread)
        .join(SegModel, SpanModel.segmentation_id == SegModel.id)
        .join(AnnModel, SegModel.annotation_id == AnnModel.id)
        .join(Stimulus, AnnModel.stimulus_id == Stimulus.id)
        .filter(Stimulus.dataset_id == source_dataset_id)
        .all()
    )
    by_letter = {}
    for span_text, l, a, b, prom, spread in rows:
        if not span_text or len(span_text) != 1 or not span_text.isalpha():
            continue
        letter = span_text.lower()
        if letter not in by_letter:
            by_letter[letter] = []
        by_letter[letter].append({
            "l": l or 50.0, "a": a or 0.0, "b": b or 0.0,
            "prominence": prom if prom is not None else 0.5,
            "spread": spread if spread is not None else 0.5,
        })
    priors = {}
    for letter, occs in by_letter.items():
        n = len(occs)
        priors[letter] = {
            "avg_l": sum(o["l"] for o in occs) / n,
            "avg_a": sum(o["a"] for o in occs) / n,
            "avg_b": sum(o["b"] for o in occs) / n,
            "avg_prominence": sum(o["prominence"] for o in occs) / n,
            "avg_spread": sum(o["spread"] for o in occs) / n,
        }

    existing_stimuli = {s.text.lower(): s for s in db.query(Stimulus).filter(Stimulus.dataset_id == dataset_id).all()}
    session_id = str(uuid.uuid4())
    sess = SessionModel(id=session_id)
    db.add(sess)

    created = 0
    for letter in ENGLISH_ALPHABET:
        prior = priors.get(letter)
        if not prior:
            continue
        stim = existing_stimuli.get(letter)
        if not stim:
            stim = Stimulus(
                id=str(uuid.uuid4()),
                dataset_id=dataset_id,
                text=letter,
                language="en",
                source_type="alphabet_import",
            )
            db.add(stim)
            existing_stimuli[letter] = stim
        for ann in db.query(Annotation).filter(Annotation.stimulus_id == stim.id).all():
            db.delete(ann)
        ann_id = str(uuid.uuid4())
        ann = Annotation(id=ann_id, session_id=session_id, stimulus_id=stim.id)
        db.add(ann)
        seg_id = str(uuid.uuid4())
        seg = Segmentation(id=seg_id, annotation_id=ann_id, raw_input=letter, boundary_influence_json=None)
        db.add(seg)
        L = max(0, min(100, prior["avg_l"]))
        a = max(-128, min(127, prior["avg_a"]))
        b = max(-128, min(127, prior["avg_b"]))
        p = max(0, min(1, prior["avg_prominence"]))
        s = max(0, min(1, prior["avg_spread"]))
        span = Span(
            id=str(uuid.uuid4()),
            segmentation_id=seg_id,
            span_text=letter,
            span_order=0,
            color_lab_l=L, color_lab_a=a, color_lab_b=b,
            prominence=p, spread=s,
        )
        db.add(span)
        hex_c = lab_to_hex(L, a, b)
        ca = ColorAnnotation(
            id=str(uuid.uuid4()),
            annotation_id=ann_id,
            target_type="whole_word",
            span_id=None,
            hex_color=hex_c,
            color_order=0,
        )
        db.add(ca)
        created += 1

    db.commit()
    return created


@router.post("/{dataset_id}/import-alphabet")
def import_alphabet(
    dataset_id: str,
    source_dataset_id: str = Query(..., description="Dataset to copy letter colors from"),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Target dataset not found")
    src = db.query(Dataset).filter(Dataset.id == source_dataset_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Source dataset not found")
    created = _import_alphabet_impl(db, dataset_id, source_dataset_id)
    return {"imported": created}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    from app.models import Stimulus, Annotation

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    # Delete stimuli (cascades to annotations via FK)
    stim_ids = [s.id for s in ds.stimuli]
    db.query(Annotation).filter(Annotation.stimulus_id.in_(stim_ids)).delete(synchronize_session=False)
    db.query(Stimulus).filter(Stimulus.dataset_id == dataset_id).delete()
    db.delete(ds)
    db.commit()
    return {"ok": True}
