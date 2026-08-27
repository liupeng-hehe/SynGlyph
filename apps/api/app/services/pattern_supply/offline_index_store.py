from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config.pattern_supply import OFFLINE_POLICY
from app.models.offline_collocation_index import OfflineCollocationIndex
from app.models.offline_context_index import OfflineContextIndex
from app.models.offline_index_version import OfflineIndexVersion
from app.models.offline_lexicon_index import OfflineLexiconIndex
from app.models.offline_pattern_index import OfflinePatternIndex
from app.models.offline_rebuild_job import OfflineRebuildJob
from app.services.pattern_supply.offline_collocation_builder import build_collocation_index_rows
from app.services.pattern_supply.offline_context_builder import build_context_index_rows
from app.services.pattern_supply.offline_pattern_builder import build_pattern_index_rows
from app.services.pattern_supply.offline_pipeline import load_corpus_stats
from app.services.pattern_supply.providers.wordfreq_provider import zipf_frequency_or_none


def start_manual_rebuild(
    db: Session,
    *,
    corpus_path: str | None = None,
    corpus_name: str = "general_web",
    version_label: str | None = None,
) -> OfflineRebuildJob:
    version = version_label or f"offline_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    version_row = OfflineIndexVersion(
        id=str(uuid.uuid4()),
        version=version,
        corpus_name=corpus_name,
        is_active=False,
        status="building",
        stats_json="{}",
    )
    job = OfflineRebuildJob(
        id=str(uuid.uuid4()),
        status="running",
        corpus_name=corpus_name,
        source_path=corpus_path or OFFLINE_POLICY.corpus_path,
        version_id=version_row.id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(version_row)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def run_rebuild_job(db: Session, *, job_id: str) -> OfflineRebuildJob:
    job = db.query(OfflineRebuildJob).filter(OfflineRebuildJob.id == job_id).first()
    if job is None:
        raise ValueError(f"rebuild job not found: {job_id}")
    version = (
        db.query(OfflineIndexVersion)
        .filter(OfflineIndexVersion.id == job.version_id)
        .first()
    )
    if version is None:
        raise ValueError(f"offline version missing for job: {job_id}")

    try:
        stats = load_corpus_stats(job.source_path)
        pattern_rows = build_pattern_index_rows(stats.word_counter)
        context_rows = build_context_index_rows(stats.context_pairs)
        colloc_rows = build_collocation_index_rows(stats.collocations)

        _delete_version_rows(db, version.id)
        _insert_pattern_rows(db, version.id, pattern_rows)
        _insert_context_rows(db, version.id, context_rows)
        _insert_collocation_rows(db, version.id, colloc_rows)
        _insert_lexicon_rows(db, version.id, stats.word_counter)

        payload = {
            "token_count": stats.token_count,
            "unique_words": stats.unique_words,
            "pattern_keys": len(pattern_rows),
            "context_keys": len(context_rows),
            "collocation_keys": len(colloc_rows),
        }
        version.status = "built"
        version.stats_json = json.dumps(payload, ensure_ascii=False)
        version.built_at = datetime.now(timezone.utc)
        job.status = "succeeded"
        job.stats_json = version.stats_json
        job.message = "rebuild succeeded"
    except Exception as exc:  # noqa: BLE001
        version.status = "failed"
        job.status = "failed"
        job.message = str(exc)
    finally:
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
    return job


def activate_version(db: Session, *, version: str) -> bool:
    row = db.query(OfflineIndexVersion).filter(OfflineIndexVersion.version == version).first()
    if row is None:
        return False
    db.query(OfflineIndexVersion).update({"is_active": False})
    row.is_active = True
    row.status = "active"
    row.activated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def active_version_row(db: Session) -> OfflineIndexVersion | None:
    return (
        db.query(OfflineIndexVersion)
        .filter(OfflineIndexVersion.is_active.is_(True))
        .order_by(OfflineIndexVersion.activated_at.desc().nullslast(), OfflineIndexVersion.created_at.desc())
        .first()
    )


def get_rebuild_job(db: Session, *, job_id: str) -> OfflineRebuildJob | None:
    return db.query(OfflineRebuildJob).filter(OfflineRebuildJob.id == job_id).first()


def offline_candidates_for_hints(
    db: Session,
    *,
    seed_terms: list[str],
    left_context: list[str] | None = None,
    right_context: list[str] | None = None,
    topic_hints: list[str] | None = None,
    per_bucket: int = 30,
) -> list[dict[str, str | float]]:
    active = active_version_row(db)
    if active is None:
        return []
    out: dict[str, dict[str, str | float]] = {}

    for seed in seed_terms:
        k1 = f"prefix:{seed[:2].lower()}"
        rows = (
            db.query(OfflinePatternIndex)
            .filter(
                OfflinePatternIndex.version_id == active.id,
                OfflinePatternIndex.pattern_key == k1,
            )
            .order_by(OfflinePatternIndex.score.desc())
            .limit(per_bucket)
            .all()
        )
        for r in rows:
            out.setdefault(
                r.normalized_word,
                {"word": r.word, "normalized_word": r.normalized_word, "score": float(r.score), "source": "offline_pattern"},
            )

    for token in left_context or []:
        key = f"left:{token.lower()}"
        rows = (
            db.query(OfflineContextIndex)
            .filter(OfflineContextIndex.version_id == active.id, OfflineContextIndex.context_key == key)
            .order_by(OfflineContextIndex.score.desc())
            .limit(per_bucket)
            .all()
        )
        for r in rows:
            out.setdefault(
                r.normalized_word,
                {"word": r.word, "normalized_word": r.normalized_word, "score": float(r.score), "source": "offline_context"},
            )

    for token in right_context or []:
        key = f"right:{token.lower()}"
        rows = (
            db.query(OfflineContextIndex)
            .filter(OfflineContextIndex.version_id == active.id, OfflineContextIndex.context_key == key)
            .order_by(OfflineContextIndex.score.desc())
            .limit(per_bucket)
            .all()
        )
        for r in rows:
            out.setdefault(
                r.normalized_word,
                {"word": r.word, "normalized_word": r.normalized_word, "score": float(r.score), "source": "offline_context"},
            )

    for topic in topic_hints or []:
        key = f"colloc:{topic.lower()}_"
        rows = (
            db.query(OfflineCollocationIndex)
            .filter(
                OfflineCollocationIndex.version_id == active.id,
                OfflineCollocationIndex.collocation_key.like(f"{key}%"),
            )
            .order_by(OfflineCollocationIndex.score.desc())
            .limit(per_bucket)
            .all()
        )
        for r in rows:
            out.setdefault(
                r.normalized_word,
                {"word": r.word, "normalized_word": r.normalized_word, "score": float(r.score), "source": "offline_collocation"},
            )

    return list(out.values())


def offline_lexicon_for_word(db: Session, *, normalized_word: str) -> OfflineLexiconIndex | None:
    active = active_version_row(db)
    if active is None:
        return None
    return (
        db.query(OfflineLexiconIndex)
        .filter(
            OfflineLexiconIndex.version_id == active.id,
            OfflineLexiconIndex.normalized_word == normalized_word,
        )
        .first()
    )


def _delete_version_rows(db: Session, version_id: str) -> None:
    db.query(OfflinePatternIndex).filter(OfflinePatternIndex.version_id == version_id).delete()
    db.query(OfflineContextIndex).filter(OfflineContextIndex.version_id == version_id).delete()
    db.query(OfflineCollocationIndex).filter(OfflineCollocationIndex.version_id == version_id).delete()
    db.query(OfflineLexiconIndex).filter(OfflineLexiconIndex.version_id == version_id).delete()
    db.flush()


def _insert_pattern_rows(db: Session, version_id: str, rows: dict[str, list[tuple[str, int, float]]]) -> None:
    for pattern_key, vals in rows.items():
        for word, count, score in vals:
            db.add(
                OfflinePatternIndex(
                    id=str(uuid.uuid4()),
                    version_id=version_id,
                    pattern_key=pattern_key,
                    word=word,
                    normalized_word=word,
                    pattern_count=int(count),
                    score=float(score),
                )
            )


def _insert_context_rows(db: Session, version_id: str, rows: dict[str, list[tuple[str, int, float]]]) -> None:
    for context_key, vals in rows.items():
        for word, count, score in vals:
            db.add(
                OfflineContextIndex(
                    id=str(uuid.uuid4()),
                    version_id=version_id,
                    context_key=context_key,
                    word=word,
                    normalized_word=word,
                    context_count=int(count),
                    score=float(score),
                )
            )


def _insert_collocation_rows(db: Session, version_id: str, rows: dict[str, list[tuple[str, int, float]]]) -> None:
    for collocation_key, vals in rows.items():
        for word, count, score in vals:
            db.add(
                OfflineCollocationIndex(
                    id=str(uuid.uuid4()),
                    version_id=version_id,
                    collocation_key=collocation_key,
                    word=word,
                    normalized_word=word,
                    collocation_count=int(count),
                    score=float(score),
                )
            )


def _insert_lexicon_rows(db: Session, version_id: str, word_counter) -> None:
    max_count = float(max(word_counter.values()) if word_counter else 1.0)
    for word, count in word_counter.items():
        zipf = zipf_frequency_or_none(word)
        db.add(
            OfflineLexiconIndex(
                id=str(uuid.uuid4()),
                version_id=version_id,
                word=word,
                normalized_word=word,
                lemma=word,
                pos=None,
                zipf_frequency=zipf,
                global_score=float(count) / max_count,
                metadata_json=json.dumps({"count": int(count)}, ensure_ascii=False),
            )
        )

