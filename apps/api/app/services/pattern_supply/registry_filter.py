from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user_word_registry import UserWordRegistry
from app.services.pattern_supply.contracts import EnrichedCandidateDTO, RawCandidateDTO
from app.services.pattern_supply.normalization import normalize_word


def get_registry_row(
    db: Session,
    *,
    selected_list_id: str,
    word: str,
) -> UserWordRegistry | None:
    normalized = normalize_word(word)
    if not normalized:
        return None
    return (
        db.query(UserWordRegistry)
        .filter(
            UserWordRegistry.selected_list_id == selected_list_id,
            UserWordRegistry.normalized_word == normalized,
        )
        .first()
    )


def exclude_candidate(
    db: Session,
    *,
    selected_list_id: str,
    candidate: RawCandidateDTO,
    exclude_selected: bool = True,
) -> tuple[bool, str | None, str]:
    row = get_registry_row(db, selected_list_id=selected_list_id, word=candidate.word)
    if row is None:
        return False, None, "unseen"
    if row.status == "annotated":
        return True, "registry_annotated", "annotated"
    if row.status == "selected" and exclude_selected:
        return True, "registry_selected", "selected"
    if row.status in {"archived", "blocked"}:
        return True, f"registry_{row.status}", row.status
    return False, None, row.status


def mark_excluded(
    candidate: RawCandidateDTO,
    *,
    status: str,
    reason: str | None,
) -> EnrichedCandidateDTO:
    return EnrichedCandidateDTO(
        word=candidate.word,
        normalized_word=candidate.normalized_word,
        lemma=candidate.lemma,
        sources=list(candidate.sources),
        source_confidence=float(candidate.source_confidence),
        generation_signals=dict(candidate.generation_signals),
        provider_payload_refs=dict(candidate.provider_payload_refs),
        pattern_features={},
        context_combos=[],
        lexical_metadata={},
        frequency_prior=None,
        collocation_metadata={},
        registry_status=status,  # type: ignore[arg-type]
        exclusion_reason=reason,
    )

