from datetime import datetime
from pydantic import BaseModel


class DatasetCreate(BaseModel):
    name: str
    owner: str  # annotator id: "A", "admin", etc.
    migrate_from_dataset_id: str | None = None  # Copy letter colors from this dataset
    is_canonical_root: bool = False
    import_source: str | None = None


class DatasetResponse(BaseModel):
    id: str
    name: str
    owner: str | None = None
    is_canonical_root: bool = False
    import_source: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
