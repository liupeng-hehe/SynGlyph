from __future__ import annotations

import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.active_learning import get_prioritized_stimuli
from app.api.pattern_supply import recommendations_top
from app.db import Base
from app.models.dataset import Dataset
from app.models.stimulus import Stimulus
from app.models.user_word_registry import UserWordRegistry
from app.schemas.pattern_supply import RecommendationsTopRequest


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_registry_exclusion_applies_to_recommendation_and_al_queue():
    db = _db()
    try:
        did = str(uuid.uuid4())
        db.add(Dataset(id=did, name="Eval", owner="test"))
        db.add(
            Stimulus(
                id=str(uuid.uuid4()),
                dataset_id=did,
                text="planet",
                language="en",
                source_type="test",
            )
        )
        db.add(
            UserWordRegistry(
                id=str(uuid.uuid4()),
                selected_list_id=did,
                word="planet",
                normalized_word="planet",
                source="seed",
                status="annotated",
            )
        )
        db.commit()

        rec = recommendations_top(
            body=RecommendationsTopRequest(selected_list_id=did, top_k=30),
            db=db,
        )
        assert all(r.normalized_word != "planet" for r in rec.rows)

        al = get_prioritized_stimuli(limit=30, selected_list_id=did, exclude_existing=True, exclude_selected=True, db=db)
        assert all(r.text.lower() != "planet" for r in al.rows)
    finally:
        db.close()

