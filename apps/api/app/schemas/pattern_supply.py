from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


RegistryStatus = Literal["unseen", "candidate", "selected", "annotated", "archived", "blocked"]


class ContextComboSchema(BaseModel):
    left_context_tokens: list[str] = Field(default_factory=list)
    right_context_tokens: list[str] = Field(default_factory=list)
    topic_hints: list[str] = Field(default_factory=list)
    domain_hints: list[str] = Field(default_factory=list)
    collocation_units: list[str] = Field(default_factory=list)
    position_signature: str | None = None


class PatternGapSchema(BaseModel):
    pattern_key: str
    target: float
    covered: float
    gap_raw: float
    gap_norm: float
    priority: float


class ContextGapSchema(BaseModel):
    context_key: str
    target: float
    covered: float
    gap_raw: float
    gap_norm: float
    priority: float


class CollocationGapSchema(BaseModel):
    collocation_key: str
    target: float
    covered: float
    gap_raw: float
    gap_norm: float
    priority: float


class CoverageDomainStateSchema(BaseModel):
    targets: dict[str, float] = Field(default_factory=dict)
    covered: dict[str, float] = Field(default_factory=dict)
    gap_summary: dict[str, float | str] = Field(default_factory=dict)


class CoverageStateWindowSchema(BaseModel):
    annotated_count: int = 0
    selected_count: int = 0
    candidate_count: int = 0


class CoverageStateSchema(BaseModel):
    selected_list_id: str
    computed_at: datetime
    window: CoverageStateWindowSchema
    pattern: CoverageDomainStateSchema
    context: CoverageDomainStateSchema
    collocation: CoverageDomainStateSchema
    normalization: dict[str, str] = Field(default_factory=dict)


class DemandProfileSchema(BaseModel):
    selected_list_id: str
    profile_version: str = "pattern_supply_v1"
    exclude_selected_default: bool = True
    pattern_gaps: list[PatternGapSchema] = Field(default_factory=list)
    context_gaps: list[ContextGapSchema] = Field(default_factory=list)
    collocation_gaps: list[CollocationGapSchema] = Field(default_factory=list)
    coverage_state: CoverageStateSchema


class RecommendationExplainSchema(BaseModel):
    reason: str
    value: float | None = None


class ScoreBreakdownSchema(BaseModel):
    demand_match_score: float = 0.0
    pattern_coverage_gain: float = 0.0
    context_coverage_gain: float = 0.0
    collocation_coverage_gain: float = 0.0
    frequency_utility: float = 0.0
    redundancy_penalty: float = 0.0
    annotation_cost: float = 0.0


class RawCandidateSchema(BaseModel):
    word: str
    normalized_word: str
    lemma: str | None = None
    sources: list[str] = Field(default_factory=list)
    source_confidence: float = 0.0
    generation_signals: dict[str, float] = Field(default_factory=dict)
    provider_payload_refs: dict[str, str] = Field(default_factory=dict)


class EnrichedCandidateSchema(RawCandidateSchema):
    pattern_features: dict[str, float | str | list[str]] = Field(default_factory=dict)
    context_combos: list[ContextComboSchema] = Field(default_factory=list)
    lexical_metadata: dict[str, str | float | list[str] | None] = Field(default_factory=dict)
    frequency_prior: float | None = None
    collocation_metadata: dict[str, str | float | list[str] | None] = Field(default_factory=dict)
    registry_status: RegistryStatus = "unseen"
    exclusion_reason: str | None = None


class RankedCandidateSchema(EnrichedCandidateSchema):
    score_breakdown: ScoreBreakdownSchema
    supply_score: float
    rank: int | None = None
    why_selected: list[RecommendationExplainSchema] = Field(default_factory=list)
    selected_for_output: bool = True


class RecommendationsTopRequest(BaseModel):
    selected_list_id: str
    top_k: int = Field(default=50, ge=1, le=500)
    exclude_existing: bool = True
    exclude_selected: bool = True
    demand_profile_override: DemandProfileSchema | None = None


class RecommendationsTopResponse(BaseModel):
    rows: list[RankedCandidateSchema]
    degraded: bool = False
    degrade_reasons: list[str] = Field(default_factory=list)
    profile_version: str = "pattern_supply_v1"
    batch_id: str | None = None
    offline_index_version: str | None = None


class FilterCandidatesRequest(BaseModel):
    selected_list_id: str
    candidates: list[RawCandidateSchema]
    exclude_existing: bool = True
    exclude_selected: bool = True


class FilterCandidatesResponse(BaseModel):
    accepted: list[RawCandidateSchema]
    excluded: list[EnrichedCandidateSchema]


class RefreshDemandProfileRequest(BaseModel):
    selected_list_id: str
    force: bool = False
    profile_ttl_seconds: int = Field(default=600, ge=30, le=86_400)


class RefreshDemandProfileResponse(BaseModel):
    profile: DemandProfileSchema
    refreshed: bool


class RebuildStartRequest(BaseModel):
    corpus_path: str | None = None
    corpus_name: str = "general_web"
    version_label: str | None = None
    activate_after_build: bool = False


class RebuildStartResponse(BaseModel):
    job_id: str
    version: str
    status: str
    message: str


class RebuildStatusResponse(BaseModel):
    job_id: str
    status: str
    corpus_name: str
    version: str | None = None
    active_version: str | None = None
    message: str | None = None
    stats: dict[str, float | int | str] = Field(default_factory=dict)


class RebuildActivateRequest(BaseModel):
    version: str


class RebuildActivateResponse(BaseModel):
    activated: bool
    version: str

