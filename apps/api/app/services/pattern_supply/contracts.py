from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal


RegistryStatus = Literal["unseen", "candidate", "selected", "annotated", "archived", "blocked"]


@dataclass(frozen=True)
class GapItem:
    key: str
    target: float
    covered: float
    gap_raw: float
    gap_norm: float
    priority: float


@dataclass(frozen=True)
class CoverageDomainState:
    targets: dict[str, float]
    covered: dict[str, float]
    gap_summary: dict[str, float | str]


@dataclass(frozen=True)
class CoverageState:
    selected_list_id: str
    computed_at: datetime
    window: dict[str, int]
    pattern: CoverageDomainState
    context: CoverageDomainState
    collocation: CoverageDomainState
    normalization: dict[str, str]


@dataclass(frozen=True)
class DemandProfile:
    selected_list_id: str
    profile_version: str
    exclude_selected_default: bool
    pattern_gaps: list[GapItem]
    context_gaps: list[GapItem]
    collocation_gaps: list[GapItem]
    coverage_state: CoverageState


@dataclass(frozen=True)
class ContextCombo:
    left_context_tokens: list[str] = field(default_factory=list)
    right_context_tokens: list[str] = field(default_factory=list)
    topic_hints: list[str] = field(default_factory=list)
    domain_hints: list[str] = field(default_factory=list)
    collocation_units: list[str] = field(default_factory=list)
    position_signature: str | None = None


@dataclass(frozen=True)
class RawCandidateDTO:
    word: str
    normalized_word: str
    lemma: str | None
    sources: list[str]
    source_confidence: float
    generation_signals: dict[str, float]
    provider_payload_refs: dict[str, str]


@dataclass(frozen=True)
class EnrichedCandidateDTO:
    word: str
    normalized_word: str
    lemma: str | None
    sources: list[str]
    source_confidence: float
    generation_signals: dict[str, float]
    provider_payload_refs: dict[str, str]
    pattern_features: dict[str, float | str | list[str]]
    context_combos: list[ContextCombo]
    lexical_metadata: dict[str, str | float | list[str] | None]
    frequency_prior: float | None
    collocation_metadata: dict[str, str | float | list[str] | None]
    registry_status: RegistryStatus
    exclusion_reason: str | None


@dataclass(frozen=True)
class RankedCandidateDTO:
    word: str
    normalized_word: str
    lemma: str | None
    sources: list[str]
    source_confidence: float
    generation_signals: dict[str, float]
    provider_payload_refs: dict[str, str]
    pattern_features: dict[str, float | str | list[str]]
    context_combos: list[ContextCombo]
    lexical_metadata: dict[str, str | float | list[str] | None]
    frequency_prior: float | None
    collocation_metadata: dict[str, str | float | list[str] | None]
    registry_status: RegistryStatus
    exclusion_reason: str | None
    score_breakdown: dict[str, float]
    supply_score: float
    rank: int | None
    why_selected: list[dict[str, float | str | None]]
    selected_for_output: bool

