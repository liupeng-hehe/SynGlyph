"""Hybrid AL queue v1: scoring math, normalization, persistence, replay."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.active_learning import get_prioritized_stimuli, refresh_prioritized_stimuli
from app.db import Base
from app.models import ALPredictionHistory, ALQueueSnapshot, Annotation, Session, Stimulus, UserWordRegistry
from app.schemas.active_learning import RefreshActiveLearningRequest
from app.services.active_learning_normalization import robust_minmax_normalize
from app.services.active_learning_scoring import compute_hybrid_al_scores
from app.services.active_learning_stats import (
    build_labeled_unit_counts,
    coverage_gain_score,
    instability_score,
    segment_novelty_score,
)
from app.services.kb_analytics.rebuild import rebuild_kb_from_stimuli


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    sess = SessionLocal()
    yield sess
    sess.close()


def _seed_stimulus(db_session, text: str, *, language: str = "en") -> str:
    sid = str(uuid.uuid4())
    db_session.add(
        Stimulus(
            id=sid,
            dataset_id=None,
            text=text,
            language=language,
            source_type="test",
        )
    )
    return sid


def _seed_annotation(db_session, stimulus_id: str) -> None:
    sess_id = str(uuid.uuid4())
    ann_id = str(uuid.uuid4())
    db_session.add(Session(id=sess_id))
    db_session.add(Annotation(id=ann_id, session_id=sess_id, stimulus_id=stimulus_id))


def test_robust_normalization_collapse_fallback():
    vals = [3.14, 3.14, 3.14]
    out = robust_minmax_normalize(vals, p_low=5, p_high=95, fallback=0.25)
    assert out == [0.25, 0.25, 0.25]


def test_novelty_and_coverage_gain_use_labeled_counts(db_session):
    seen_id = _seed_stimulus(db_session, "banana")
    _seed_annotation(db_session, seen_id)
    db_session.commit()

    counts = build_labeled_unit_counts(db_session)
    novelty_seen = segment_novelty_score("banana", counts)
    novelty_unseen = segment_novelty_score("xylophone", counts)
    assert novelty_unseen > novelty_seen

    coverage_seen = coverage_gain_score("banana", counts)
    coverage_unseen = coverage_gain_score("xylophone", counts)
    assert coverage_unseen > coverage_seen


def test_instability_formula():
    b_hist = [0.1, 0.9, 0.3, 0.7]
    a_hist = [0.2, 0.8, 0.4, 0.6]
    score = instability_score(b_hist, a_hist)
    assert score > 0.0


def test_refresh_persist_and_get_replay_behavior(db_session):
    _seed_stimulus(db_session, "apple")
    _seed_stimulus(db_session, "banana")
    _seed_stimulus(db_session, "cherry")
    db_session.commit()

    refresh = refresh_prioritized_stimuli(
        RefreshActiveLearningRequest(limit=2),
        db=db_session,
    )
    assert refresh.ok is True
    assert refresh.rows_written == 2

    queue_rows = db_session.query(ALQueueSnapshot).all()
    history_rows = db_session.query(ALPredictionHistory).all()
    assert len(queue_rows) == 2
    assert len(history_rows) == 2

    replay = get_prioritized_stimuli(limit=2, db=db_session)
    assert len(replay.rows) == 2
    assert replay.meta.refresh_batch_id == refresh.refresh_batch_id
    assert replay.rows[0].score >= replay.rows[1].score

    replay2 = get_prioritized_stimuli(limit=2, db=db_session)
    assert [r.stimulus_id for r in replay2.rows] == [r.stimulus_id for r in replay.rows]


def test_selected_list_exclusion_applies_to_refresh(db_session):
    did = str(uuid.uuid4())
    sid_a = _seed_stimulus(db_session, "planet")
    sid_b = _seed_stimulus(db_session, "rocket")
    db_session.query(Stimulus).filter(Stimulus.id == sid_a).update({"dataset_id": did})
    db_session.query(Stimulus).filter(Stimulus.id == sid_b).update({"dataset_id": did})
    db_session.add(
        UserWordRegistry(
            id=str(uuid.uuid4()),
            selected_list_id=did,
            word="planet",
            normalized_word="planet",
            source="test",
            status="annotated",
        )
    )
    db_session.commit()
    refresh = refresh_prioritized_stimuli(
        RefreshActiveLearningRequest(limit=5, selected_list_id=did, exclude_existing=True, exclude_selected=True),
        db=db_session,
    )
    assert refresh.ok
    replay = get_prioritized_stimuli(
        limit=5,
        selected_list_id=did,
        exclude_existing=True,
        exclude_selected=True,
        db=db_session,
    )
    assert all(r.text.lower() != "planet" for r in replay.rows)


def test_compute_hybrid_includes_kb_pattern_deficit_detail_when_debug_flag(db_session):
    _seed_stimulus(db_session, "zebra")
    db_session.commit()
    rebuild_kb_from_stimuli(db_session, label="kb_al_debug", max_words=10, source="test")
    result = compute_hybrid_al_scores(db_session, limit=1, include_kb_pattern_debug=True)
    assert len(result.rows) >= 1
    raw = result.rows[0].score_raw_json
    assert "kb_pattern_deficit_detail" in raw
    assert isinstance(raw["kb_pattern_deficit_detail"], list)
