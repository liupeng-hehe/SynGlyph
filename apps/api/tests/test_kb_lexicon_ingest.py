"""KB lexicon ingestion: online merge (mocked), file text, api_cached."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db import Base
from app.models import KbVocabVersion, KbWord
from app.services.kb_analytics.queries import latest_gap_snapshot
from app.services.kb_analytics.rebuild import rebuild_kb_from_lexicon_entries
from app.services.kb_lexicon.ingest import ingest_api_cached, ingest_lexicon_text, ingest_online_hybrid
from app.services.kb_lexicon.online_hybrid import OnlineHybridConfig


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def test_rebuild_kb_from_lexicon_entries_no_stimuli(db_session):
    vid = rebuild_kb_from_lexicon_entries(
        db_session,
        entries=[
            {"normalized_word": "hello", "raw_word": "hello"},
            {"normalized_word": "world", "raw_word": "world"},
        ],
        label="lex_only",
        source_kind="lexicon_file",
        import_summary={"merged_unique_count": 2},
        copy_english_segments=False,
    )
    n = db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).count()
    assert n == 2
    snap = latest_gap_snapshot(db_session, vid)
    assert snap and snap["gap"].get("kb_lexicon", {}).get("word_count") == 2


@patch("app.services.kb_lexicon.datamuse_enrich.query_words")
@patch("app.services.kb_lexicon.online_hybrid.fetch_random_words")
def test_online_hybrid_merge_summary(mock_rw, mock_qw, db_session, tmp_path: Path):
    mock_rw.side_effect = [["apple", "Zebra!", "banana"], ["cat"]]
    mock_qw.return_value = [{"word": "document"}, {"word": "no space here"}]

    cfg = OnlineHybridConfig(
        label="t-online",
        random_rounds=2,
        random_per_round=3,
        length_buckets=[None],
        datamuse_queries=[{"sp": "*ment", "max_results": 5}],
        datamuse_max_per_query=5,
        seed_enrichment_count=0,
    )
    vid, summary = ingest_online_hybrid(db_session, cfg=cfg, set_active=True)

    assert summary["merged_unique_count"] >= 1
    words = {w.normalized_word for w in db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).all()}
    assert "apple" in words or "banana" in words or "cat" in words

    v = db_session.query(KbVocabVersion).filter(KbVocabVersion.id == vid).one()
    assert v.source_kind == "online_hybrid"
    assert v.import_summary_json


def test_ingest_lexicon_text(db_session):
    vid, summary = ingest_lexicon_text(
        db_session,
        text="one\ntwo\nTWO\nbad-hyphen\n",
        label="paste",
        set_active=True,
    )
    assert summary["merged_unique_count"] == 2
    norms = {w.normalized_word for w in db_session.query(KbWord).filter(KbWord.vocab_version_id == vid)}
    assert norms == {"one", "two"}


def test_ingest_api_cached_json(tmp_path: Path, db_session):
    p = tmp_path / "cached.json"
    p.write_text(json.dumps([{"word": "alpha"}, {"word": "not-good"}, "beta"]), encoding="utf-8")
    vid, summary = ingest_api_cached(db_session, path=p, label="cached", set_active=True)
    assert summary["merged_unique_count"] == 2
    norms = {w.normalized_word for w in db_session.query(KbWord).filter(KbWord.vocab_version_id == vid)}
    assert norms == {"alpha", "beta"}
