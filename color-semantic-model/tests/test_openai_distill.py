"""Offline tests for OpenAI distillation row building."""

from __future__ import annotations

from colorrec.data.openai_distill import (
    build_positive_descriptor,
    build_studio_anchor,
    openai_draft_to_row,
)


def test_build_studio_anchor_matches_color_studio_pattern() -> None:
    anchor = build_studio_anchor(
        "The horn section lingered.",
        ["warm", "nostalgic"],
    )
    assert anchor == "warm, nostalgic. The horn section lingered."


def test_openai_draft_to_row_schema() -> None:
    row = openai_draft_to_row(
        {
            "hex": "#C4A574",
            "color_name": "muted champagne wash",
            "description": "A soft golden haze like old poster paper.",
            "reason": "Warm nostalgia without muddy darkness.",
            "confidence": "high",
        },
        anchor="warm, nostalgic. jazz poster",
        feelings=["warm", "nostalgic"],
        passage="jazz poster",
        weight=3.5,
        model="gpt-4o-mini",
    )
    assert row.positive_hex == "#C4A574"
    assert row.color_family
    assert "muted champagne wash" in row.positive_descriptor
    assert row.weight == 3.5


def test_build_positive_descriptor_includes_feelings_and_reason() -> None:
    desc = build_positive_descriptor(
        color_name="sepia wash",
        family="brown",
        hex_val="#704214",
        description="Dusty concert hall light.",
        reason="Ties jazz nostalgia to readable brown wash.",
        feelings=["warm", "nostalgic"],
        passage="jazz poster",
    )
    assert "warm, nostalgic" in desc
    assert "jazz poster" in desc
    assert "Dusty concert hall" in desc
