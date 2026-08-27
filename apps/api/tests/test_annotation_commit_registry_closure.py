from __future__ import annotations

import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.annotation_commit import annotation_commit
from app.api.registry import registry_check
from app.db import Base
from app.models.dataset import Dataset
from app.models.session import Session as SessionModel
from app.models.stimulus import Stimulus
from app.schemas.annotation import AnnotationCommitRequest, SegmentInput


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_annotation_commit_writes_registry_annotated():
    db = _db()
    try:
        did = str(uuid.uuid4())
        sid = str(uuid.uuid4())
        stim_id = str(uuid.uuid4())
        db.add(Dataset(id=did, name="Eval", owner="test"))
        db.add(SessionModel(id=sid))
        db.add(Stimulus(id=stim_id, dataset_id=did, text="planet", language="en", source_type="test"))
        db.commit()

        req = AnnotationCommitRequest(
            session_id=sid,
            stimulus_id=stim_id,
            selected_list_id=did,
            word="planet",
            segments=[SegmentInput(text_span="planet", color_lab=[70, 0, 0], prominence=0.5, spread=0.5)],
        )
        out = annotation_commit(req, db=db)
        assert out.registry_status == "annotated"
        status = registry_check(word="planet", selected_list_id=did, db=db)
        assert status.exists is True
        assert status.status == "annotated"
        assert status.annotated_at is not None
    finally:
        db.close()

