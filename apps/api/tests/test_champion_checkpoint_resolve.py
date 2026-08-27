"""Champion checkpoint describe/resolve (BYO + letter_sequence step 4)."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — register metadata
from app.db import Base
from app.models.ml_dataset_version import MLDatasetVersion
from app.models.ml_deployment import MLDeployment
from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.services.letter_sequence_checkpoint_resolve import (
    describe_active_champion_letter_sequence,
    resolve_active_champion_checkpoint_path,
)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def _seed_snapshot(sess, checkpoint_uri: str) -> tuple[str, str]:
    run = TrainingRun(
        id=str(uuid.uuid4()),
        status="finished",
        mode="letter_sequence",
        dataset_id=None,
        config_json="{}",
        out_dir="/tmp",
    )
    sess.add(run)
    sess.commit()
    snap_id = str(uuid.uuid4())
    snap = ModelSnapshot(
        id=snap_id,
        training_run_id=run.id,
        name="t",
        checkpoint_uri=checkpoint_uri,
        config_json="{}",
    )
    sess.add(snap)
    dv = MLDatasetVersion(
        id=str(uuid.uuid4()),
        product_line="english",
        task_name="letter_sequence",
        source_mode="stimulus",
        schema_version="letter_sequence_dataset_v1",
        split_seed=42,
        split_strategy="stable_hash_v1",
        example_count=1,
        train_count=1,
        val_count=0,
        test_count=0,
        dataset_hash="0" * 64,
        manifest_uri="file:///tmp/m.json",
    )
    sess.add(dv)
    sess.commit()
    return snap_id, dv.id


def test_describe_no_active_deployment(db_session):
    info = describe_active_champion_letter_sequence(db_session, environment="staging")
    assert info["ok"] is False
    assert info["reason"] == "no_active_deployment"
    assert info["environment"] == "staging"


def test_describe_ok_readable_checkpoint(db_session, tmp_path: Path):
    ckpt = tmp_path / "letter_sequence.pt"
    ckpt.write_bytes(b"\x00")
    snap_id, dv_id = _seed_snapshot(db_session, str(ckpt))
    db_session.add(
        MLDeployment(
            id=str(uuid.uuid4()),
            environment="dev",
            product_line="english",
            task_name="letter_sequence",
            alias="champion",
            model_snapshot_id=snap_id,
            dataset_version_id=dv_id,
            is_active=True,
        )
    )
    db_session.commit()

    info = describe_active_champion_letter_sequence(db_session, environment="dev")
    assert info["ok"] is True
    assert info["reason"] is None
    assert info["checkpoint_uri"] == str(ckpt.resolve())
    p = resolve_active_champion_checkpoint_path(db_session, environment="dev")
    assert p is not None and p.is_file()


def test_describe_checkpoint_missing_on_disk(db_session):
    snap_id, dv_id = _seed_snapshot(db_session, "/nonexistent/path/letter_sequence.pt")
    db_session.add(
        MLDeployment(
            id=str(uuid.uuid4()),
            environment="dev",
            product_line="english",
            task_name="letter_sequence",
            alias="champion",
            model_snapshot_id=snap_id,
            dataset_version_id=dv_id,
            is_active=True,
        )
    )
    db_session.commit()

    info = describe_active_champion_letter_sequence(db_session, environment="dev")
    assert info["ok"] is False
    assert info["reason"] == "checkpoint_not_readable"


def test_describe_ambiguous_active(db_session, tmp_path: Path):
    ckpt = tmp_path / "letter_sequence.pt"
    ckpt.write_bytes(b"\x00")
    snap_id, dv_id = _seed_snapshot(db_session, str(ckpt))
    for _ in range(2):
        db_session.add(
            MLDeployment(
                id=str(uuid.uuid4()),
                environment="dev",
                product_line="english",
                task_name="letter_sequence",
                alias="champion",
                model_snapshot_id=snap_id,
                dataset_version_id=dv_id,
                is_active=True,
            )
        )
    db_session.commit()

    info = describe_active_champion_letter_sequence(db_session, environment="dev")
    assert info["ok"] is False
    assert info["reason"] == "ambiguous_active_deployment"
