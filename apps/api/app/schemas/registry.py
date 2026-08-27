from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


RegistryStatus = Literal["unseen", "candidate", "selected", "annotated", "archived", "blocked"]


class RegistryCheckResponse(BaseModel):
    exists: bool
    word: str
    normalized_word: str
    selected_list_id: str
    status: RegistryStatus | None = None
    first_seen_at: datetime | None = None
    annotated_at: datetime | None = None
    annotation_version: str | None = None

