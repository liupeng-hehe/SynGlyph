"""Public ingestion API -> ``rebuild_kb_from_lexicon_entries``."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.services.kb_analytics.rebuild import rebuild_kb_from_lexicon_entries
from app.services.kb_lexicon.api_cached import parse_api_cached_file
from app.services.kb_lexicon.builtin_wordfreq import entries_from_wordfreq_topn
from app.services.kb_lexicon.file_lexicon import parse_lexicon_file, parse_lexicon_text_lines
from app.services.kb_lexicon.online_hybrid import OnlineHybridConfig, build_online_hybrid_entries


def ingest_builtin_wordfreq(
    db: Session,
    *,
    label: str,
    limit: int = 5000,
    set_active: bool = True,
) -> tuple[str, dict]:
    entries = entries_from_wordfreq_topn(limit)
    import_summary = {"merged_unique_count": len(entries), "requested_limit": limit}
    vid = rebuild_kb_from_lexicon_entries(
        db,
        entries=[dict(e) for e in entries],
        label=label,
        source_kind="builtin_provider",
        source_name="wordfreq",
        source_ref=None,
        import_config={"limit": limit, "normalization_rules": {"alphabet": "strict_lowercase_a_to_z"}},
        import_summary=import_summary,
        pipeline_source="kb_lexicon.ingest_builtin_wordfreq",
        set_active=set_active,
        copy_english_segments=False,
    )
    return vid, import_summary


def ingest_api_cached(
    db: Session,
    *,
    path: Path,
    label: str,
    set_active: bool = True,
) -> tuple[str, dict]:
    entries = parse_api_cached_file(path)
    import_summary = {"merged_unique_count": len(entries)}
    vid = rebuild_kb_from_lexicon_entries(
        db,
        entries=[dict(e) for e in entries],
        label=label,
        source_kind="api_cached",
        source_name=path.name,
        source_ref=str(path.resolve()),
        import_config={"path": str(path.resolve())},
        import_summary=import_summary,
        pipeline_source="kb_lexicon.ingest_api_cached",
        set_active=set_active,
        copy_english_segments=False,
    )
    return vid, import_summary


def ingest_online_hybrid(
    db: Session,
    *,
    cfg: OnlineHybridConfig | None = None,
    label: str | None = None,
    set_active: bool = True,
) -> tuple[str, dict]:
    """Build KB snapshot from Random Word API + Datamuse enrichment."""
    cfg = cfg or OnlineHybridConfig()
    if label:
        cfg.label = label
    entries, import_config, import_summary = build_online_hybrid_entries(cfg)
    vid = rebuild_kb_from_lexicon_entries(
        db,
        entries=[dict(e) for e in entries],
        label=cfg.label,
        source_kind="online_hybrid",
        source_name="random_word_api + datamuse",
        source_ref=None,
        import_config=import_config,
        import_summary=import_summary,
        pipeline_source="kb_lexicon.ingest_online_hybrid",
        set_active=set_active,
        copy_english_segments=False,
    )
    return vid, import_summary


def ingest_lexicon_text(
    db: Session,
    *,
    text: str,
    label: str,
    set_active: bool = True,
    source_name: str = "lexicon_text",
) -> tuple[str, dict]:
    """Build KB from pasted newline-separated words."""
    entries = parse_lexicon_text_lines(text, entry_source_name=source_name)
    import_summary = {"merged_unique_count": len(entries)}
    vid = rebuild_kb_from_lexicon_entries(
        db,
        entries=[dict(e) for e in entries],
        label=label,
        source_kind="lexicon_file",
        source_name=source_name,
        source_ref=None,
        import_config={"format": "newline_text", "normalization_rules": {"alphabet": "strict_lowercase_a_to_z"}},
        import_summary=import_summary,
        pipeline_source="kb_lexicon.ingest_lexicon_text",
        set_active=set_active,
        copy_english_segments=False,
    )
    return vid, import_summary


def ingest_lexicon_path(
    db: Session,
    *,
    path: Path,
    label: str,
    set_active: bool = True,
) -> tuple[str, dict]:
    entries = parse_lexicon_file(path)
    import_summary = {"merged_unique_count": len(entries)}
    vid = rebuild_kb_from_lexicon_entries(
        db,
        entries=[dict(e) for e in entries],
        label=label,
        source_kind="lexicon_file",
        source_name=path.name,
        source_ref=str(path.resolve()),
        import_config={"path": str(path)},
        import_summary=import_summary,
        pipeline_source="kb_lexicon.ingest_lexicon_path",
        set_active=set_active,
        copy_english_segments=False,
    )
    return vid, import_summary
