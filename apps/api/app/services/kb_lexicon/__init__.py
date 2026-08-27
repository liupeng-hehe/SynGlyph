"""KB lexicon ingestion: external sources -> unified entries -> KB snapshot (Orthographic Prior)."""

from app.services.kb_lexicon.ingest import (
    ingest_api_cached,
    ingest_builtin_wordfreq,
    ingest_lexicon_path,
    ingest_lexicon_text,
    ingest_online_hybrid,
)

__all__ = [
    "ingest_api_cached",
    "ingest_builtin_wordfreq",
    "ingest_lexicon_path",
    "ingest_lexicon_text",
    "ingest_online_hybrid",
]
