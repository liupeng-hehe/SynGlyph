from typing import Literal

from pydantic import BaseModel, Field


class PrioritizedStimulus(BaseModel):
    stimulus_id: str
    text: str
    score: float
    boundary_uncertainty: float
    segment_attribute_uncertainty: float
    segment_novelty: float
    coverage_gain: float
    instability: float


class ActiveLearningSnapshotMeta(BaseModel):
    model_snapshot_id: str | None = None
    scoring_stage: str | None = None
    snapshot_time: str | None = None
    refresh_batch_id: str | None = None


class PrioritizedStimuliResponse(BaseModel):
    rows: list[PrioritizedStimulus]
    meta: ActiveLearningSnapshotMeta


class RefreshActiveLearningRequest(BaseModel):
    limit: int = 50
    snapshot_id: str | None = None
    checkpoint_path_override: str | None = None
    selected_list_id: str | None = None
    exclude_existing: bool = True
    exclude_selected: bool = True
    kb_vocab_version_id: str | None = Field(
        None,
        description="Optional KB vocab version id; defaults to active kb_vocab_version.",
    )
    candidate_source: str = Field(
        default="stimulus",
        description="Candidate source: `stimulus` or `kb`.",
    )
    tie_break_mode: Literal["none", "hash", "random"] | None = Field(
        default=None,
        description="Score tie-break: `none`, `hash`, or `random`. Omit to use env/default (`hash`).",
    )
    include_kb_pattern_debug: bool = Field(
        default=False,
        description="When true, persist per-pattern deficit rows under kb_pattern_deficit_detail in score_raw_json.",
    )


class RefreshActiveLearningResponse(BaseModel):
    ok: bool
    rows_written: int
    refresh_batch_id: str
    meta: ActiveLearningSnapshotMeta
