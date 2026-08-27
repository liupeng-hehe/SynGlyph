"""Chinese Phase 1: canonical ids, hash, freeze export integration."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db import Base
from app.models.chinese import (
    ChineseAnnotationSession,
    ChineseDictionary,
    ChineseGlyphInstance,
    ChineseGlyphTemplate,
    ChineseRegion,
)
from app.services.chinese_canonical import (
    TASK_NAME,
    compute_dataset_hash,
    example_id_for_instance,
)
from app.services.chinese_dataset_export import freeze_chinese_dataset_version
from app.services.chinese_dataset_quality import collect_issues_for_example


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def test_example_id_deterministic():
    gid = str(uuid.uuid4())
    assert example_id_for_instance(gid) == example_id_for_instance(gid)
    assert len(example_id_for_instance(gid)) == 64


def test_dataset_hash_order_independent():
    a = {"example_id": "a", "x": 1}
    b = {"example_id": "b", "x": 2}
    assert compute_dataset_hash([a, b]) == compute_dataset_hash([b, a])


def test_quality_issue_has_severity():
    row = {
        "example_id": "e1",
        "character": "X",
        "glyph_instance_id": "g1",
        "template": {"missing_template": True},
        "strokes": [],
        "regions": [],
        "transitions": [],
    }
    issues = collect_issues_for_example(row)
    assert any(i.get("severity") for i in issues)


def test_freeze_minimal_instance(db_session, tmp_path, monkeypatch):
    import app.services.artifact_paths as ap_paths

    monkeypatch.setattr(ap_paths, "_artifacts_root", lambda: tmp_path.resolve())

    did = str(uuid.uuid4())
    sid = str(uuid.uuid4())
    tid = str(uuid.uuid4())
    iid = str(uuid.uuid4())
    rid = str(uuid.uuid4())

    db_session.add(ChineseDictionary(id=did, name="dict", owner="dict_owner_smoke"))
    db_session.add(ChineseAnnotationSession(id=sid, dictionary_id=did))
    strokes = ["M0 0 L10 0"]
    medians = [[[0.0, 0.0], [10.0, 0.0]]]
    db_session.add(
        ChineseGlyphTemplate(
            id=tid,
            character="测",
            decomposition_json=json.dumps("test"),
            matches_json=json.dumps([]),
            strokes_json=json.dumps(strokes),
            medians_json=json.dumps(medians),
        )
    )
    db_session.add(
        ChineseGlyphInstance(
            id=iid,
            session_id=sid,
            template_id=tid,
            character="测",
            transform_json=json.dumps({"scale": 1.0}),
        )
    )
    db_session.add(
        ChineseRegion(
            id=rid,
            glyph_instance_id=iid,
            name="r1",
            selection_mode="stroke_group",
            stroke_ids_json=json.dumps([0]),
            polygon_json=None,
            anchor_json=json.dumps({"x": 0.5, "y": 0.5}),
            color_json=json.dumps({"space": "lab", "value": [50, 0, 0]}),
            spread_json=json.dumps({"sx": 0.1, "sy": 0.1}),
        )
    )
    db_session.commit()

    dv = freeze_chinese_dataset_version(db_session, task_name=TASK_NAME, source_cutoff_at=None)
    assert dv.product_line == "chinese"
    assert dv.task_name == TASK_NAME
    assert dv.split_strategy == "full_export_v1"
    assert dv.train_count == dv.example_count
    assert dv.val_count == 0
    assert dv.test_count == 0

    out = tmp_path / "datasets" / dv.id
    ex = out / "examples.jsonl"
    assert ex.is_file()
    line = ex.read_text(encoding="utf-8").strip().split("\n")[0]
    row = json.loads(line)
    assert row["metadata"]["dictionary_owner"] == "dict_owner_smoke"
    assert row["metadata"]["transform_json"] == {"scale": 1.0}
    assert "region_id_to_index" in row
    assert row["regions"][0]["region_id"] == rid
    assert (out / "quality_report.json").is_file()
    assert (out / "stats.json").is_file()
    assert "region_count_distribution" in json.loads((out / "stats.json").read_text(encoding="utf-8"))
