"""Tests for descriptor generation."""

from __future__ import annotations

from colorrec.descriptors import build_descriptor_from_color


def test_deep_crimson_descriptor() -> None:
    desc = build_descriptor_from_color(
        name="deep crimson",
        family="red",
        h=350,
        s=0.85,
        l=0.22,
    )
    lower = desc.lower()
    assert "deep crimson" in lower
    assert "red family" in lower
    assert "dark" in lower or "deep" in lower
    assert "vivid" in lower or "saturated" in lower or "bold" in lower
    assert "warm" in lower
    assert "passionate" in lower or "intense" in lower


def test_pale_blue_descriptor() -> None:
    desc = build_descriptor_from_color(
        name="pale sky blue",
        family="blue",
        h=210,
        s=0.35,
        l=0.82,
    )
    lower = desc.lower()
    assert "pale sky blue" in lower
    assert "blue family" in lower
    assert "pale" in lower or "light" in lower
    assert "cool" in lower
    assert "calm" in lower or "clean" in lower


def test_metadata_keywords_deduped() -> None:
    desc = build_descriptor_from_color(
        name="ocean",
        family="blue",
        h=200,
        s=0.6,
        l=0.5,
        metadata={"keywords": ["calm", "CALM", "trustworthy", ""]},
    )
    lower = desc.lower()
    assert lower.count("calm") == 1
    assert "trustworthy" in lower
