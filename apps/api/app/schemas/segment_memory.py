from datetime import datetime
from pydantic import BaseModel, Field


class SegmentMemoryResponse(BaseModel):
    id: str
    segment_text: str
    count: int
    prefix_count: int
    middle_count: int
    suffix_count: int
    avg_l: float
    avg_a: float
    avg_b: float
    avg_prominence: float
    avg_spread: float
    example_words: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class SegmentMemoryMergeRequest(BaseModel):
    target_segment_id: str  # segment to merge INTO
    source_segment_id: str  # segment to merge FROM (will be deleted)


class SegmentMemoryUpdateRequest(BaseModel):
    segment_text: str | None = None
    rejected: bool | None = None
