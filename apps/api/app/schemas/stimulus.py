from datetime import datetime
from pydantic import BaseModel, Field


class CreateStimulusRequest(BaseModel):
    text: str
    language: str = "en"
    source_type: str = "manual"
    dataset_id: str | None = None


class StimulusResponse(BaseModel):
    id: str
    text: str
    language: str
    source_type: str
    created_at: datetime
    dataset_id: str | None = None

    model_config = {"from_attributes": True}
