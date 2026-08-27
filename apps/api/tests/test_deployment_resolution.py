"""get_active_deployment strict semantics."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — register metadata
from app.db import Base
from app.models.ml_dataset_version import MLDatasetVersion
from app.models.ml_deployment import MLDeployment
from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.services.deployment_resolution import AmbiguousActiveDeploymentError, get_active_deployment


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def _seed_snapshot(sess) -> tuple[str, str]:
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
        checkpoint_uri="/tmp/x.pt",
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


def test_zero_active(db_session):
    assert get_active_deployment(db_session, environment="dev", product_line="english", task_name="letter_sequence") is None


def test_one_active(db_session):
    snap_id, dv_id = _seed_snapshot(db_session)
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
    dep = get_active_deployment(db_session, environment="dev", product_line="english", task_name="letter_sequence")
    assert dep is not None
    assert dep.model_snapshot_id == snap_id


def test_multiple_active_raises(db_session):
    snap_id, dv_id = _seed_snapshot(db_session)
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
    with pytest.raises(AmbiguousActiveDeploymentError):
        get_active_deployment(db_session, environment="dev", product_line="english", task_name="letter_sequence")
