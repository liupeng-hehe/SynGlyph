"""Tests for semantic family inference from color names."""

from __future__ import annotations

from colorrec.colorspace import infer_semantic_family


def test_wine_red_is_red_not_grey() -> None:
    family = infer_semantic_family("Wine Red", 350.0, 0.35, 0.52, "grey")
    assert family == "red"


def test_sage_green_is_green_not_yellow() -> None:
    family = infer_semantic_family("Sage Green", 68.0, 0.78, 0.45, "yellow")
    assert family == "green"


def test_burnt_sienna_is_orange_or_brown() -> None:
    family = infer_semantic_family("Burnt Sienna", 345.0, 0.25, 0.52, "grey")
    assert family in {"orange", "brown"}


def test_periwinkle_is_purple() -> None:
    family = infer_semantic_family("Periwinkle", 270.0, 0.45, 0.62, "grey")
    assert family == "purple"


def test_fallback_to_hsl_family() -> None:
    family = infer_semantic_family("unknown shade", 210.0, 0.8, 0.5, "blue")
    assert family == "blue"
