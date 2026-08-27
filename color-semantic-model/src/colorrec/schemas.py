"""Pydantic schemas for candidate colors and training pairs."""

from __future__ import annotations

import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


_HEX_RE = re.compile(r"^#[0-9A-F]{6}$")


def normalize_hex(hex_str: str) -> str:
    """Normalize to ``#RRGGBB`` uppercase."""
    s = hex_str.strip()
    if not s.startswith("#"):
        s = f"#{s}"
    if len(s) == 4:
        s = "#" + "".join(c * 2 for c in s[1:])
    s = s.upper()
    if not _HEX_RE.match(s):
        raise ValueError(f"Invalid hex color: {hex_str!r}")
    return s


class CandidateColor(BaseModel):
    color_id: str
    source: str
    name: str
    hex: str
    r: int
    g: int
    b: int
    h: float
    s: float
    l: float
    family: str
    descriptor: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("hex")
    @classmethod
    def validate_hex(cls, v: str) -> str:
        return normalize_hex(v)

    @field_validator("name", "family", "descriptor")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must be non-empty")
        return v.strip()

    @field_validator("r", "g", "b")
    @classmethod
    def validate_rgb_channel(cls, v: int) -> int:
        if not 0 <= v <= 255:
            raise ValueError(f"RGB channel must be 0-255, got {v}")
        return v

    @field_validator("h")
    @classmethod
    def validate_hue(cls, v: float) -> float:
        if not 0.0 <= v <= 360.0:
            raise ValueError(f"Hue must be 0-360, got {v}")
        return float(v)

    @field_validator("s", "l")
    @classmethod
    def validate_sl(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"S/L must be 0-1, got {v}")
        return float(v)

    def to_json_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class TrainingPair(BaseModel):
    pair_id: str
    anchor: str
    positive: str
    negatives: list[str] = Field(default_factory=list)
    positive_color_id: Optional[str] = None
    positive_hex: Optional[str] = None
    source: str
    weight: float = 1.0
    split: Optional[Literal["train", "val", "test"]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("anchor", "positive")
    @classmethod
    def validate_non_empty_text(cls, v: str) -> str:
        if not v or not str(v).strip():
            raise ValueError("anchor and positive must be non-empty")
        return str(v).strip()

    @field_validator("weight")
    @classmethod
    def validate_weight(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("weight must be > 0")
        return float(v)

    @model_validator(mode="after")
    def validate_positive_hex(self) -> TrainingPair:
        if self.positive_hex is not None:
            self.positive_hex = normalize_hex(self.positive_hex)
        return self
