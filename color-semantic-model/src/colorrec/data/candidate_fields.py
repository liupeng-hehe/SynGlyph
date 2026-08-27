"""Shared candidate color field preparation (display name + semantic family)."""

from __future__ import annotations

from typing import Any

from colorrec.colorspace import (
    clean_display_name,
    infer_color_family_from_hsl_or_rgb,
    infer_semantic_family,
)
from colorrec.descriptors import build_descriptor_from_color


def prepare_color_fields(
    raw_name: str,
    *,
    hex_val: str,
    r: int,
    g: int,
    b: int,
    h: float,
    s: float,
    l: float,
    extra_metadata: dict[str, Any] | None = None,
) -> tuple[str, str, str, str, dict[str, Any]]:
    """Return display_name, family_display, family_hsl, descriptor, metadata."""
    display_name = clean_display_name(raw_name, hex_val)
    family_hsl = infer_color_family_from_hsl_or_rgb(r, g, b, h=h, s=s, l=l)
    family_display = infer_semantic_family(display_name, h, s, l, family_hsl)
    metadata = dict(extra_metadata or {})
    metadata.update(
        {
            "raw_name": raw_name.strip(),
            "display_name": display_name,
            "family_hsl": family_hsl,
            "family_display": family_display,
        }
    )
    descriptor = build_descriptor_from_color(
        display_name,
        family_display,
        h,
        s,
        l,
        metadata=metadata,
    )
    return display_name, family_display, family_hsl, descriptor, metadata
