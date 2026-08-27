"""metric_fact rollup from ml_evaluation_run."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db import Base
from app.models.ml_dataset_version import MLDatasetVersion
from app.models.ml_evaluation_run import MLEvaluationRun
from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.services.metrics_rollup import rollup_ml_evaluation_runs


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def _seed_eval(sess, mid: str, mae_b: float) -> None:
    dv = str(uuid.uuid4())
    sess.add(
        MLDatasetVersion(
            id=dv,
            product_line="english",
            task_name="letter_sequence",
            source_mode="stimulus",
            schema_version="v1",
            split_seed=1,
            split_strategy="by_stimulus",
            example_count=10,
            train_count=7,
            val_count=2,
            test_count=1,
            dataset_hash="x",
            manifest_uri="file:///x",
        )
    )
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
    snap = ModelSnapshot(
        id=str(uuid.uuid4()),
        training_run_id=run.id,
        name="t",
        checkpoint_uri="/tmp/x.pt",
        config_json="{}",
        dataset_version_id=dv,
        model_family="mlp",
    )
    sess.add(snap)
    sess.commit()
    metrics = {
        "mae_lab": 1.0,
        "mae_prominence": 0.1,
        "mae_spread": 0.1,
        "mae_boundary": mae_b,
        "n_examples": 5,
    }
    er = MLEvaluationRun(
        id=mid,
        product_line="english",
        task_name="letter_sequence",
        dataset_version_id=dv,
        model_snapshot_id=snap.id,
        split_name="val",
        metrics_json=json.dumps(metrics),
        status="completed",
    )
    sess.add(er)
    sess.commit()


def test_rollup_inserts_metric_fact(db_session):
    eid = str(uuid.uuid4())
    _seed_eval(db_session, eid, mae_b=0.4)
    n = rollup_ml_evaluation_runs(db_session, limit=10)
    assert n >= 4
    db_session.commit()
    from app.models.metric_fact import MetricFact

    row = (
        db_session.query(MetricFact)
        .filter(MetricFact.subject_id == eid, MetricFact.metric_key == "mae_boundary")
        .first()
    )
    assert row is not None
    assert abs(row.metric_value - 0.4) < 1e-6
    assert row.metric_direction == "down"
