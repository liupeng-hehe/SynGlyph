from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class SegmentInput(BaseModel):
    text_span: str
    color_lab: list[float] = Field(..., min_length=3, max_length=3)  # [L, a, b]
    prominence: float = Field(ge=0, le=1, default=0.5)
    spread: float = Field(ge=0, le=1, default=0.5)

    @model_validator(mode="after")
    def check_color_lab(self):
        L, a, b = self.color_lab[0], self.color_lab[1], self.color_lab[2]
        if not (0 <= L <= 100):
            raise ValueError("L must be in [0, 100]")
        if not (-128 <= a <= 127) or not (-128 <= b <= 127):
            raise ValueError("a and b must be in [-128, 127]")
        return self


class CreateAnnotationRequest(BaseModel):
    session_id: str
    stimulus_id: str
    segments: list[SegmentInput]
    boundary_influence: list[float] | None = None

    @model_validator(mode="after")
    def check_segments_non_empty(self):
        if not self.segments:
            raise ValueError("segments must not be empty")
        return self


class AnnotationCommitRequest(CreateAnnotationRequest):
    selected_list_id: str
    word: str
    annotation_version: str | None = None
    notes: str | None = None
    predicted_segments: list[SegmentInput] | None = None
    edit_burden: float | None = None


class AnnotationCommitResponse(BaseModel):
    annotation_id: str
    registry_status: str
    excluded_future: bool = True
    selected_list_id: str


class SpanResponse(BaseModel):
    id: str
    segmentation_id: str
    span_text: str
    span_order: int
    color_lab: list[float]
    prominence: float
    spread: float


class ColorAnnotationResponse(BaseModel):
    id: str
    annotation_id: str
    target_type: str
    span_id: str | None
    hex_color: str
    color_order: int

    model_config = {"from_attributes": True}


class SegmentationResponse(BaseModel):
    id: str
    annotation_id: str
    raw_input: str
    spans: list[SpanResponse] = []
    boundary_influence: list[float] | None = None

    model_config = {"from_attributes": True}


class StimulusBriefResponse(BaseModel):
    id: str
    text: str
    language: str
    source_type: str

    model_config = {"from_attributes": True}


class AnnotationResponse(BaseModel):
    id: str
    session_id: str
    stimulus_id: str
    created_at: datetime
    stimulus: StimulusBriefResponse | None = None
    segmentation: SegmentationResponse | None = None
    color_annotations: list[ColorAnnotationResponse] = []

    model_config = {"from_attributes": True}
