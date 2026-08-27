from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.pattern_supply import recommendations_top
from app.api.pattern_supply_rebuild import rebuild_activate, rebuild_start, rebuild_status
from app.db import Base
from app.models.dataset import Dataset
from app.schemas.pattern_supply import (
    RebuildActivateRequest,
    RebuildStartRequest,
    RecommendationsTopRequest,
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_pattern_supply_recommendations_runs_end_to_end():
    db = _db()
    try:
        did = str(uuid.uuid4())
        db.add(Dataset(id=did, name="Eval", owner="test"))
        db.commit()
        body = RecommendationsTopRequest(selected_list_id=did, top_k=10)
        out = recommendations_top(body=body, db=db)
        assert out.rows is not None
        assert len(out.rows) <= 10
        if out.rows:
            assert out.rows[0].supply_score >= out.rows[-1].supply_score
            assert out.rows[0].normalized_word
    finally:
        db.close()


def test_offline_rebuild_and_activate_flow(tmp_path: Path):
    db = _db()
    try:
        corpus = tmp_path / "general_web.txt"
        corpus.write_text(
            "language models capture contextual patterns\n"
            "pattern supply boosts active learning coverage\n",
            encoding="utf-8",
        )
        start = rebuild_start(
            body=RebuildStartRequest(
                corpus_path=str(corpus),
                corpus_name="general_web",
                activate_after_build=False,
            ),
            db=db,
        )
        assert start.status == "succeeded"
        status = rebuild_status(job_id=start.job_id, db=db)
        assert status.version is not None
        assert status.stats.get("unique_words", 0) > 0
        activated = rebuild_activate(
            body=RebuildActivateRequest(version=str(status.version)),
            db=db,
        )
        assert activated.activated is True
    finally:
        db.close()


def test_recommendations_include_offline_index_version(tmp_path: Path):
    db = _db()
    try:
        did = str(uuid.uuid4())
        db.add(Dataset(id=did, name="Eval", owner="test"))
        db.commit()
        corpus = tmp_path / "general_web.txt"
        corpus.write_text(
            "emotion language context collocation pattern\n"
            "emotion color language pattern signal\n",
            encoding="utf-8",
        )
        start = rebuild_start(
            body=RebuildStartRequest(
                corpus_path=str(corpus),
                corpus_name="general_web",
                activate_after_build=True,
            ),
            db=db,
        )
        assert start.status == "succeeded"
        body = RecommendationsTopRequest(selected_list_id=did, top_k=5)
        out = recommendations_top(body=body, db=db)
        assert out.offline_index_version is not None
    finally:
        db.close()

