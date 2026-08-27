from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.pattern_supply import (
    FilterCandidatesRequest,
    FilterCandidatesResponse,
    RefreshDemandProfileRequest,
    RefreshDemandProfileResponse,
    RecommendationsTopRequest,
    RecommendationsTopResponse,
)
from app.services.pattern_supply.demand_profile import refresh_demand_profile
from app.services.pattern_supply.orchestrator import run_pattern_supply
from app.services.pattern_supply.registry_filter import exclude_candidate, mark_excluded

router = APIRouter(prefix="/api/pattern-supply", tags=["pattern-supply"])


@router.post("/recommendations/top", response_model=RecommendationsTopResponse)
def recommendations_top(
    body: RecommendationsTopRequest,
    db: Session = Depends(get_db),
):
    profile = body.demand_profile_override
    out = run_pattern_supply(
        db,
        selected_list_id=body.selected_list_id,
        top_k=body.top_k,
        seed_terms=_seed_terms_from_profile(profile),
        left_context=_left_context_from_profile(profile),
        right_context=_right_context_from_profile(profile),
        topic_hints=_topic_hints_from_profile(profile),
        domain_hints=_domain_hints_from_profile(profile),
        related_words=[],
        exclude_existing=body.exclude_existing,
        exclude_selected=body.exclude_selected,
        force_profile_refresh=profile is None,
    )
    return RecommendationsTopResponse(
        rows=[_ranked_to_schema(x) for x in out.rows],
        degraded=out.degraded,
        degrade_reasons=out.degrade_reasons,
        profile_version=out.profile.profile_version,
        batch_id=out.batch_id,
        offline_index_version=out.offline_index_version,
    )


@router.post("/candidates/filter", response_model=FilterCandidatesResponse)
def candidates_filter(
    body: FilterCandidatesRequest,
    db: Session = Depends(get_db),
):
    accepted = []
    excluded = []
    for c in body.candidates:
        exc, reason, status = exclude_candidate(
            db,
            selected_list_id=body.selected_list_id,
            candidate=c,
            exclude_selected=body.exclude_selected,
        )
        if exc and body.exclude_existing:
            excluded.append(mark_excluded(c, status=status, reason=reason))
        else:
            accepted.append(c)
    return FilterCandidatesResponse(
        accepted=accepted,
        excluded=[_enriched_to_schema(x) for x in excluded],
    )


@router.post("/demand-profile/refresh", response_model=RefreshDemandProfileResponse)
def demand_profile_refresh(
    body: RefreshDemandProfileRequest,
    db: Session = Depends(get_db),
):
    profile = refresh_demand_profile(
        db,
        selected_list_id=body.selected_list_id,
        force=body.force,
        ttl_seconds=body.profile_ttl_seconds,
    )
    return RefreshDemandProfileResponse(profile=profile, refreshed=True)


def _seed_terms_from_profile(profile) -> list[str]:
    if profile is None:
        return ["color", "emotion", "word"]
    vals = [x.pattern_key.split(":")[-1] for x in profile.pattern_gaps[:8]]
    return [v for v in vals if v and len(v) >= 3]


def _left_context_from_profile(profile) -> list[str]:
    if profile is None:
        return []
    return [x.context_key.split(":")[-1] for x in profile.context_gaps[:4]]


def _right_context_from_profile(profile) -> list[str]:
    if profile is None:
        return []
    return [x.context_key.split(":")[-1] for x in profile.context_gaps[4:8]]


def _topic_hints_from_profile(profile) -> list[str]:
    if profile is None:
        return ["general"]
    return [x.collocation_key.split(":")[-1] for x in profile.collocation_gaps[:4]]


def _domain_hints_from_profile(profile) -> list[str]:
    if profile is None:
        return []
    return [x.collocation_key.split(":")[-1] for x in profile.collocation_gaps[4:8]]


def _ranked_to_schema(row):
    from app.schemas.pattern_supply import RankedCandidateSchema, ScoreBreakdownSchema, RecommendationExplainSchema

    return RankedCandidateSchema(
        word=row.word,
        normalized_word=row.normalized_word,
        lemma=row.lemma,
        sources=row.sources,
        source_confidence=row.source_confidence,
        generation_signals=row.generation_signals,
        provider_payload_refs=row.provider_payload_refs,
        pattern_features=row.pattern_features,
        context_combos=[c.__dict__ for c in row.context_combos],
        lexical_metadata=row.lexical_metadata,
        frequency_prior=row.frequency_prior,
        collocation_metadata=row.collocation_metadata,
        registry_status=row.registry_status,
        exclusion_reason=row.exclusion_reason,
        score_breakdown=ScoreBreakdownSchema(**row.score_breakdown),
        supply_score=row.supply_score,
        rank=row.rank,
        why_selected=[RecommendationExplainSchema(**x) for x in row.why_selected],
        selected_for_output=row.selected_for_output,
    )


def _enriched_to_schema(row):
    from app.schemas.pattern_supply import EnrichedCandidateSchema

    return EnrichedCandidateSchema(
        word=row.word,
        normalized_word=row.normalized_word,
        lemma=row.lemma,
        sources=row.sources,
        source_confidence=row.source_confidence,
        generation_signals=row.generation_signals,
        provider_payload_refs=row.provider_payload_refs,
        pattern_features=row.pattern_features,
        context_combos=row.context_combos,
        lexical_metadata=row.lexical_metadata,
        frequency_prior=row.frequency_prior,
        collocation_metadata=row.collocation_metadata,
        registry_status=row.registry_status,
        exclusion_reason=row.exclusion_reason,
    )

