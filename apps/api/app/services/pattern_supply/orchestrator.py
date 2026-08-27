from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.schemas.pattern_supply import DemandProfileSchema
from app.services.pattern_supply.candidate_generation import generate_candidates
from app.services.pattern_supply.contracts import EnrichedCandidateDTO
from app.services.pattern_supply.demand_profile import refresh_demand_profile
from app.services.pattern_supply.enrichment import enrich_candidates
from app.services.pattern_supply.offline_index_store import active_version_row
from app.services.pattern_supply.recommendation import persist_candidates, persist_recommendations
from app.services.pattern_supply.registry_filter import exclude_candidate, mark_excluded
from app.services.pattern_supply.scoring import rank_candidates


@dataclass(frozen=True)
class OrchestratorResult:
    batch_id: str
    rows: list
    excluded: list[EnrichedCandidateDTO]
    degraded: bool
    degrade_reasons: list[str]
    profile: DemandProfileSchema
    offline_index_version: str | None


def run_pattern_supply(
    db: Session,
    *,
    selected_list_id: str,
    top_k: int,
    seed_terms: list[str],
    left_context: list[str] | None = None,
    right_context: list[str] | None = None,
    topic_hints: list[str] | None = None,
    domain_hints: list[str] | None = None,
    related_words: list[str] | None = None,
    exclude_existing: bool = True,
    exclude_selected: bool = True,
    force_profile_refresh: bool = False,
) -> OrchestratorResult:
    profile = refresh_demand_profile(
        db,
        selected_list_id=selected_list_id,
        force=force_profile_refresh,
    )
    generated = generate_candidates(
        db=db,
        seed_terms=seed_terms,
        left_context=left_context,
        right_context=right_context,
        topic_hints=topic_hints,
        related_words=related_words,
    )
    enriched = enrich_candidates(
        db,
        generated,
        left_context=left_context,
        right_context=right_context,
        topic_hints=topic_hints,
        domain_hints=domain_hints,
    )

    accepted: list[EnrichedCandidateDTO] = []
    excluded: list[EnrichedCandidateDTO] = []
    for row in enriched:
        if not exclude_existing:
            accepted.append(row)
            continue
        exc, reason, status = exclude_candidate(
            db,
            selected_list_id=selected_list_id,
            candidate=row,  # EnrichedCandidateDTO is compatible with required fields.
            exclude_selected=exclude_selected,
        )
        if exc:
            excluded.append(mark_excluded(row, status=status, reason=reason))
            continue
        accepted.append(
            EnrichedCandidateDTO(
                **{
                    **row.__dict__,
                    "registry_status": status,  # type: ignore[arg-type]
                    "exclusion_reason": None,
                }
            )
        )

    ranked = rank_candidates(accepted, demand_profile=profile)
    ranked = ranked[: max(1, int(top_k))]
    batch_id = str(uuid.uuid4())
    persist_candidates(db, batch_id=batch_id, selected_list_id=selected_list_id, accepted=accepted, excluded=excluded)
    persist_recommendations(db, batch_id=batch_id, selected_list_id=selected_list_id, rows=ranked)
    db.commit()

    active = active_version_row(db)
    return OrchestratorResult(
        batch_id=batch_id,
        rows=ranked,
        excluded=excluded,
        degraded=generated.degraded,
        degrade_reasons=generated.degrade_reasons,
        profile=profile,
        offline_index_version=active.version if active else None,
    )

