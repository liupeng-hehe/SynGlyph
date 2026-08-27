"""Contract tests for /api/lab (BYO) — response shape and error codes."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.api.lab import (
    PredictWordBody,
    PreviewBody,
    ProfileInitBody,
    TrainBody,
    post_preview,
    post_predict_word,
    post_train,
    profile_init,
)
from app.db import Base, settings


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def _mock_request() -> MagicMock:
    request = MagicMock()
    request.headers.get.return_value = None
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    return request


def test_profile_init_preview_has_provenance_rule_fallback(db_session):
    body = ProfileInitBody(display_name="Contract Tester", track="lite")
    out = profile_init(body, _mock_request(), db_session)
    assert out["profile_id"]
    assert out["preview"]["render_version"].startswith("rv_")
    assert out["preview"]["provenance"]["kind"] == "rule_fallback"
    assert out["next_task"]["type"] == "letter"


def test_post_preview_404_unknown_profile(db_session):
    with pytest.raises(HTTPException) as ei:
        post_preview(
            PreviewBody(profile_id=str(uuid.uuid4())),
            db_session,
        )
    assert ei.value.status_code == 404


def test_post_predict_word_shape_rule_fallback(db_session):
    out_init = profile_init(
        ProfileInitBody(display_name="PredictWord Tester", track="lite"),
        _mock_request(),
        db_session,
    )
    pid = out_init["profile_id"]
    out = post_predict_word(
        PredictWordBody(profile_id=pid, word="cat"),
        db_session,
    )
    assert out["word"] == "cat"
    assert out["provenance"]["kind"] == "rule_fallback"
    assert len(out["letters"]) == 3
    assert all("char" in x and "hex" in x and "lab" in x for x in out["letters"])
    assert isinstance(out["boundary"], list)


def test_profile_init_force_new_creates_second_profile(db_session):
    body = ProfileInitBody(display_name="Force New User", track="lite")
    first = profile_init(body, _mock_request(), db_session)
    second = profile_init(
        ProfileInitBody(display_name="Force New User", track="lite", force_new=True),
        _mock_request(),
        db_session,
    )
    assert first["profile_id"] != second["profile_id"]
    assert second["resumed"] is False


def test_profile_init_adopts_best_legacy_when_duplicates(db_session):
    from app.models.lab_profile import LabLetterAnnotation, LabProfile
    from app.services.lab_manifest import build_manifest
    import json

    mf = build_manifest(seed=99, manifest_version=1)
    stale_id = str(uuid.uuid4())
    rich_id = str(uuid.uuid4())
    for pid, annotated in ((stale_id, 0), (rich_id, 5)):
        db_session.add(
            LabProfile(
                id=pid,
                user_key=f"legacy-{pid[:8]}",
                display_name="Legacy Dup",
                slug=f"legacy-dup-{pid[:8]}",
                mode="local_training_first",
                track="lite",
                phase="letters",
                training_status="idle",
                interruption_state="none",
                satisfaction_state="not_started",
                manifest_version=mf.manifest_version,
                seed=mf.seed,
                letters_order_json=mf.letters_order_json(),
                coverage_words_json=json.dumps(list(mf.coverage_words)),
                checks_json=json.dumps(list(mf.checks)),
                palette_history_json="[]",
            )
        )
        for i in range(26):
            ch = chr(ord("a") + i)
            db_session.add(
                LabLetterAnnotation(
                    id=str(uuid.uuid4()),
                    profile_id=pid,
                    char=ch,
                    color_hex="#4a5dff",
                    locked=0,
                    annotated=1 if i < annotated else 0,
                )
            )
    db_session.commit()

    out = profile_init(
        ProfileInitBody(display_name="Legacy Dup", track="lite"),
        _mock_request(),
        db_session,
    )
    assert out["profile_id"] == rich_id
    assert out["resumed"] is True


def test_post_train_returns_503_when_disabled(db_session):
    with patch.object(settings, "lab_training_enabled", False):
        with pytest.raises(HTTPException) as ei:
            post_train(TrainBody(profile_id=str(uuid.uuid4())), db_session)
        assert ei.value.status_code == 503
        assert "LAB_TRAINING_ENABLED" in str(ei.value.detail)
