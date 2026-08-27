from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.services.pattern_supply.contracts import RawCandidateDTO
from app.services.pattern_supply.normalization import normalize_word
from app.services.pattern_supply.offline_index_store import offline_candidates_for_hints
from app.services.pattern_supply.providers.datamuse_client import DatamuseError, query_words


@dataclass(frozen=True)
class CandidateGenerationResult:
    rows: list[RawCandidateDTO]
    degraded: bool
    degrade_reasons: list[str]


def generate_candidates(
    *,
    db: Session,
    seed_terms: list[str],
    left_context: list[str] | None = None,
    right_context: list[str] | None = None,
    topic_hints: list[str] | None = None,
    related_words: list[str] | None = None,
    limit_per_query: int = 40,
) -> CandidateGenerationResult:
    rows_by_word: dict[str, RawCandidateDTO] = {}
    degraded = False
    reasons: list[str] = []

    def upsert_word(word: str, source: str, score: float = 0.0) -> None:
        normalized = normalize_word(word)
        if not normalized:
            return
        row = rows_by_word.get(normalized)
        if row is None:
            rows_by_word[normalized] = RawCandidateDTO(
                word=word,
                normalized_word=normalized,
                lemma=None,
                sources=[source],
                source_confidence=max(0.0, float(score)),
                generation_signals={source: 1.0},
                provider_payload_refs={},
            )
            return
        sources = sorted(set(row.sources + [source]))
        generation_signals = dict(row.generation_signals)
        generation_signals[source] = generation_signals.get(source, 0.0) + 1.0
        rows_by_word[normalized] = RawCandidateDTO(
            word=row.word,
            normalized_word=row.normalized_word,
            lemma=row.lemma,
            sources=sources,
            source_confidence=max(float(row.source_confidence), float(score)),
            generation_signals=generation_signals,
            provider_payload_refs=row.provider_payload_refs,
        )

    offline_rows = offline_candidates_for_hints(
        db,
        seed_terms=seed_terms,
        left_context=left_context,
        right_context=right_context,
        topic_hints=topic_hints,
    )
    for item in offline_rows:
        upsert_word(
            str(item.get("word") or ""),
            str(item.get("source") or "offline"),
            float(item.get("score") or 0.0),
        )
    if offline_rows:
        reasons.append("offline_index_primary")

    if not rows_by_word:
        # Datamuse fallback only when offline index cannot serve.
        for seed in seed_terms:
            try:
                for item in query_words({"ml": seed, "max": limit_per_query}):
                    w = str(item.get("word") or "").strip()
                    if w:
                        upsert_word(w, "semantic", float(item.get("score") or 0.0))
            except DatamuseError:
                degraded = True
                reasons.append("datamuse_semantic_unavailable")
            try:
                for item in query_words({"sp": f"{seed[:3]}*", "max": limit_per_query}):
                    w = str(item.get("word") or "").strip()
                    if w:
                        upsert_word(w, "spelling", float(item.get("score") or 0.0))
            except DatamuseError:
                degraded = True
                reasons.append("datamuse_spelling_unavailable")

    # related-word driven
    if not rows_by_word:
        for rel in related_words or []:
            try:
                for item in query_words({"rel_trg": rel, "max": limit_per_query}):
                    w = str(item.get("word") or "").strip()
                    if w:
                        upsert_word(w, "related_word", float(item.get("score") or 0.0))
            except DatamuseError:
                degraded = True
                reasons.append("datamuse_related_unavailable")

    # context-driven
    if not rows_by_word:
        context_tokens = list(left_context or []) + list(right_context or []) + list(topic_hints or [])
        for token in context_tokens:
            try:
                for item in query_words({"rel_jjb": token, "max": max(10, limit_per_query // 2)}):
                    w = str(item.get("word") or "").strip()
                    if w:
                        upsert_word(w, "context", float(item.get("score") or 0.0))
            except DatamuseError:
                degraded = True
                reasons.append("datamuse_context_unavailable")

    # Local fallback when all external sources fail.
    if not rows_by_word:
        fallback = seed_terms + (related_words or []) + (topic_hints or [])
        for token in fallback:
            upsert_word(token, "local_fallback", 0.1)
        if fallback:
            degraded = True
            reasons.append("local_fallback_used")

    return CandidateGenerationResult(
        rows=sorted(rows_by_word.values(), key=lambda x: x.normalized_word),
        degraded=degraded,
        degrade_reasons=sorted(set(reasons)),
    )

