from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.pattern_supply.candidate_generation import CandidateGenerationResult
from app.services.pattern_supply.context_combo import build_context_combos
from app.services.pattern_supply.contracts import EnrichedCandidateDTO
from app.services.pattern_supply.offline_index_store import offline_lexicon_for_word
from app.services.pattern_supply.pattern_extraction import extract_pattern_features
from app.services.pattern_supply.providers.collocation_provider import collocation_metadata
from app.services.pattern_supply.providers.lexical_provider import lexical_metadata
from app.services.pattern_supply.providers.wordfreq_provider import zipf_frequency_or_none


def enrich_candidates(
    db: Session,
    generated: CandidateGenerationResult,
    *,
    left_context: list[str] | None = None,
    right_context: list[str] | None = None,
    topic_hints: list[str] | None = None,
    domain_hints: list[str] | None = None,
) -> list[EnrichedCandidateDTO]:
    out: list[EnrichedCandidateDTO] = []
    for row in generated.rows:
        pattern_features = extract_pattern_features(row)
        colloc = collocation_metadata(row.normalized_word, topic_hints=topic_hints)
        combos = build_context_combos(
            left_context=left_context,
            right_context=right_context,
            topic_hints=topic_hints,
            domain_hints=domain_hints,
            collocation_units=list(colloc.get("units") or []),
            position_signature=str(pattern_features.get("position") or "word"),
        )
        lex = lexical_metadata(row.normalized_word)
        freq = zipf_frequency_or_none(row.normalized_word)
        offline_lex = offline_lexicon_for_word(db, normalized_word=row.normalized_word)
        if offline_lex is not None:
            if freq is None and offline_lex.zipf_frequency is not None:
                freq = float(offline_lex.zipf_frequency)
            lex.setdefault("lemma", offline_lex.lemma or row.normalized_word)
            lex["offline_global_score"] = float(offline_lex.global_score)
        out.append(
            EnrichedCandidateDTO(
                word=row.word,
                normalized_word=row.normalized_word,
                lemma=lex.get("lemma") if isinstance(lex.get("lemma"), str) else None,
                sources=row.sources,
                source_confidence=row.source_confidence,
                generation_signals=row.generation_signals,
                provider_payload_refs=row.provider_payload_refs,
                pattern_features=pattern_features,
                context_combos=combos,
                lexical_metadata={
                    "pos": lex.get("pos_guess"),
                    "definition": lex.get("definition"),
                    "dictionary_source": lex.get("dictionary_source"),
                    "offline_global_score": lex.get("offline_global_score"),
                },
                frequency_prior=freq,
                collocation_metadata=colloc,
                registry_status="unseen",
                exclusion_reason=None,
            )
        )
    return out

