#!/usr/bin/env python3
"""
Phase 1 smoke: no pre-existing snapshot required.

1. Pure helpers: dataset hash stability (letter_sequence package).
2. Tiny mock checkpoint + evaluate_snapshot on temp JSONL.
3. get_active_deployment semantics on in-memory SQLite (0 / 1 / ambiguous).
"""

from __future__ import annotations

import json
import sys
import tempfile
import uuid
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_PKG))
sys.path.insert(0, str(_API))

import torch  # noqa: E402

from letter_sequence.data.export_dataset import (  # noqa: E402
    canonical_to_v2_legacy,
    compute_dataset_hash,
    v2_sample_row_to_canonical,
)
from letter_sequence.eval.evaluate_snapshot import evaluate_snapshot  # noqa: E402
from letter_sequence.models.letter_sequence_model import LetterSequenceBiLSTM  # noqa: E402


def _sample_row(word: str = "cat") -> dict:
    L = len(word)
    letters = list(word.lower())
    return {
        "schema_version": 2,
        "annotation_id": "a1",
        "stimulus_id": "s1",
        "word_text": word,
        "letters": letters,
        "raw_input": "|".join(letters),
        "target_lab": [[1.0, 2.0, 3.0]] * L,
        "target_prominence": [0.1] * L,
        "target_spread": [0.2] * L,
        "target_boundary": [0.3] * max(0, L - 1),
        "split": "val",
    }


def _test_hash_deterministic() -> None:
    row = _sample_row()
    c = v2_sample_row_to_canonical(
        row,
        stimulus_id=row["stimulus_id"],
        annotation_id=row["annotation_id"],
        example_id="e1",
        split="val",
    )
    h1 = compute_dataset_hash([c])
    h2 = compute_dataset_hash([c])
    assert h1 == h2, "dataset hash must be stable"
    legacy = canonical_to_v2_legacy(c)
    assert legacy.get("schema_version") == 2


def _test_eval_mock() -> None:
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        jsonl = td_path / "samples.jsonl"
        row = _sample_row("ab")
        jsonl.write_text(json.dumps(row) + "\n", encoding="utf-8")

        model = LetterSequenceBiLSTM(
            emb_dim=32,
            hidden=16,
            num_layers=1,
            dropout=0.0,
            max_len=32,
            pos_dim=8,
            extra_dim=4,
            use_extra_features=True,
        )
        ckpt_path = td_path / "tiny.pt"
        torch.save(
            {
                "model_state": model.state_dict(),
                "config": {
                    "emb_dim": 32,
                    "hidden": 16,
                    "num_layers": 1,
                    "dropout": 0.0,
                    "max_len": 32,
                    "pos_dim": 8,
                    "use_extra_features": True,
                    "extra_dim": 4,
                },
            },
            ckpt_path,
        )
        out = evaluate_snapshot(ckpt_path, jsonl, split="val")
        assert "mae_lab" in out
        assert out.get("n_examples") == 1


def _test_deployment_sqlite() -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import Base
    from app.models.ml_dataset_version import MLDatasetVersion
    from app.models.ml_deployment import MLDeployment
    from app.models.model_snapshot import ModelSnapshot
    from app.models.training_run import TrainingRun
    from app.services.deployment_resolution import AmbiguousActiveDeploymentError, get_active_deployment

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    run = TrainingRun(
        id=str(uuid.uuid4()),
        status="finished",
        mode="letter_sequence",
        dataset_id=None,
        config_json="{}",
        out_dir="/tmp",
    )
    db.add(run)
    db.commit()

    snap_id = str(uuid.uuid4())
    snap = ModelSnapshot(
        id=snap_id,
        training_run_id=run.id,
        name="smoke",
        checkpoint_uri="/nonexistent.pt",
        config_json="{}",
    )
    db.add(snap)

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
    db.add(dv)
    db.commit()

    assert get_active_deployment(db, environment="dev", product_line="english", task_name="letter_sequence") is None

    d1 = MLDeployment(
        id=str(uuid.uuid4()),
        environment="dev",
        product_line="english",
        task_name="letter_sequence",
        alias="champion",
        model_snapshot_id=snap_id,
        dataset_version_id=dv.id,
        is_active=True,
    )
    db.add(d1)
    db.commit()
    got = get_active_deployment(db, environment="dev", product_line="english", task_name="letter_sequence")
    assert got is not None and got.model_snapshot_id == snap_id

    d2 = MLDeployment(
        id=str(uuid.uuid4()),
        environment="dev",
        product_line="english",
        task_name="letter_sequence",
        alias="champion",
        model_snapshot_id=snap_id,
        dataset_version_id=dv.id,
        is_active=True,
    )
    db.add(d2)
    db.commit()
    try:
        get_active_deployment(db, environment="dev", product_line="english", task_name="letter_sequence")
    except AmbiguousActiveDeploymentError:
        pass
    else:
        raise AssertionError("expected AmbiguousActiveDeploymentError")

    db.close()


def main() -> None:
    _test_hash_deterministic()
    _test_eval_mock()
    _test_deployment_sqlite()
    print("smoke_phase1: ok")


if __name__ == "__main__":
    main()
