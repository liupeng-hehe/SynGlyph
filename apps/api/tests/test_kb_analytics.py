"""Knowledge base rebuild, queries, and AL KB scoring."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db import Base
from app.models import Dataset, KbWord
from app.models.stimulus import Stimulus
from app.services.kb_analytics.queries import get_pattern_by_key, latest_gap_snapshot, top_words_for_pattern
from app.services.kb_analytics.rebuild import rebuild_kb_from_lexicon_entries, rebuild_kb_from_stimuli
from app.services.kb_analytics.scoring import kb_pattern_gap_score_for_text, kb_scores_for_text


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


def _seed_stimuli(sess) -> None:
    for w in ("alpha", "alphabet", "beta"):
        sess.add(
            Stimulus(
                id=str(uuid.uuid4()),
                dataset_id=None,
                text=w,
                language="en",
                source_type="test",
            )
        )
    sess.commit()


def test_rebuild_and_top_words(db_session):
    _seed_stimuli(db_session)
    vid = rebuild_kb_from_stimuli(db_session, label="test_kb", max_words=10, source="test")
    assert vid
    p = get_pattern_by_key(db_session, vid, "ng2:al")
    assert p is not None
    rows = top_words_for_pattern(db_session, vid, p.id, limit=10)
    assert any(r["word"] == "alpha" for r in rows)


def test_rebuild_dedupes_same_normalized_word(db_session):
    """Duplicate stimuli that normalize to the same token must not violate kb_word unique index."""
    db_session.add(
        Stimulus(
            id=str(uuid.uuid4()),
            dataset_id=None,
            text="hello",
            language="en",
            source_type="test",
            frequency_rank=100,
        )
    )
    db_session.add(
        Stimulus(
            id=str(uuid.uuid4()),
            dataset_id=None,
            text="Hello",
            language="en",
            source_type="test",
            frequency_rank=1,
        )
    )
    db_session.add(
        Stimulus(
            id=str(uuid.uuid4()),
            dataset_id=None,
            text="beta",
            language="en",
            source_type="test",
            frequency_rank=2,
        )
    )
    db_session.commit()

    vid = rebuild_kb_from_stimuli(db_session, label="dedup_kb", max_words=10, source="test")
    words = db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).all()
    assert len(words) == 2
    hello_rows = [w for w in words if w.normalized_word == "hello"]
    assert len(hello_rows) == 1
    assert hello_rows[0].raw_text == "Hello"


def test_rebuild_kb_lexicon_entries_patterns(db_session):
    vid = rebuild_kb_from_lexicon_entries(
        db_session,
        entries=[{"normalized_word": "document", "raw_word": "document"}],
        label="lex",
        source_kind="lexicon_file",
        copy_english_segments=False,
    )
    p2 = get_pattern_by_key(db_session, vid, "ng2:do")
    assert p2 is not None
    p4 = get_pattern_by_key(db_session, vid, "ng4:ment")
    assert p4 is not None
    assert p4.unit_type == "ngram_4"


def test_gap_snapshot_includes_ngram_four_unit(db_session):
    vid = rebuild_kb_from_lexicon_entries(
        db_session,
        entries=[{"normalized_word": "document", "raw_word": "document"}],
        label="lex_gap",
        source_kind="lexicon_file",
        copy_english_segments=False,
    )
    snap = latest_gap_snapshot(db_session, vid)
    assert snap and snap.get("gap")
    gaps = snap["gap"].get("under_covered_patterns") or []
    assert any(g.get("unit_type") == "ngram_4" for g in gaps)


def test_kb_scores_for_text(db_session):
    _seed_stimuli(db_session)
    vid = rebuild_kb_from_stimuli(db_session, label="t2", max_words=10, source="test")
    s = kb_pattern_gap_score_for_text(db_session, "alphabet", vid)
    assert 0.0 <= s <= 1.0
    full = kb_scores_for_text(db_session, "test", vocab_version_id=vid)
    assert full.get("kb_active") is True
    assert full.get("kb_pattern_gap") is not None


def test_rebuild_kb_max_words_caps_query_before_dedupe(db_session):
    words = ("one", "two", "three", "four", "five")
    for i, w in enumerate(words):
        db_session.add(
            Stimulus(
                id=str(uuid.uuid4()),
                dataset_id=None,
                text=w,
                language="en",
                source_type="test",
                frequency_rank=i,
            )
        )
    db_session.commit()
    vid = rebuild_kb_from_stimuli(db_session, label="cap2", max_words=2, source="test")
    assert db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).count() == 2


def test_rebuild_kb_max_words_none_includes_all_unique(db_session):
    words = ("one", "two", "three", "four", "five")
    for i, w in enumerate(words):
        db_session.add(
            Stimulus(
                id=str(uuid.uuid4()),
                dataset_id=None,
                text=w,
                language="en",
                source_type="test",
                frequency_rank=i,
            )
        )
    db_session.commit()
    vid = rebuild_kb_from_stimuli(db_session, label="full", max_words=None, source="test")
    assert db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).count() == 5


def test_rebuild_kb_dataset_full_matches_deduped_stimuli(db_session):
    """Selected-list style: all words in dataset_id end up as KbWord (one per normalized spelling)."""
    ds_id = str(uuid.uuid4())
    db_session.add(Dataset(id=ds_id, name="list_cov"))
    s1 = str(uuid.uuid4())
    s2 = str(uuid.uuid4())
    s3 = str(uuid.uuid4())
    db_session.add(
        Stimulus(
            id=s1,
            dataset_id=ds_id,
            text="hello",
            language="en",
            source_type="test",
            frequency_rank=2,
        )
    )
    db_session.add(
        Stimulus(
            id=s2,
            dataset_id=ds_id,
            text="Hello",
            language="en",
            source_type="test",
            frequency_rank=1,
        )
    )
    db_session.add(
        Stimulus(
            id=s3,
            dataset_id=ds_id,
            text="zoo",
            language="en",
            source_type="test",
            frequency_rank=3,
        )
    )
    db_session.commit()
    vid = rebuild_kb_from_stimuli(
        db_session,
        label="ds_cov",
        max_words=None,
        dataset_id=ds_id,
        source="test",
    )
    kws = db_session.query(KbWord).filter(KbWord.vocab_version_id == vid).all()
    assert len(kws) == 2
    by_norm = {w.normalized_word: w for w in kws}
    assert set(by_norm) == {"hello", "zoo"}
    assert by_norm["hello"].stimulus_id == s2


def test_kb_scores_pattern_deficit_detail_optional(db_session):
    _seed_stimuli(db_session)
    vid = rebuild_kb_from_stimuli(db_session, label="detail_kb", max_words=10, source="test")
    full = kb_scores_for_text(
        db_session,
        "alpha",
        vocab_version_id=vid,
        include_pattern_deficit_detail=True,
        pattern_deficit_detail_limit=8,
    )
    assert "kb_pattern_deficit_detail" in full
    detail = full["kb_pattern_deficit_detail"]
    assert isinstance(detail, list)
    assert len(detail) <= 8
    assert all("deficit" in row and "pattern_key" in row for row in detail)
