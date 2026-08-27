"""Tests for color space utilities."""

from __future__ import annotations

import pytest

from colorrec.colorspace import (
    hex_to_rgb,
    hsl_to_rgb,
    infer_color_family_from_hsl_or_rgb,
    rgb_to_hex,
    rgb_to_hsl,
    saturation_bucket,
    lightness_bucket,
)


def test_hex_to_rgb_red() -> None:
    assert hex_to_rgb("#FF0000") == (255, 0, 0)
    assert hex_to_rgb("FF0000") == (255, 0, 0)


def test_rgb_to_hex_red() -> None:
    assert rgb_to_hex(255, 0, 0) == "#FF0000"


def test_rgb_to_hsl_red_hue_near_zero() -> None:
    h, s, l = rgb_to_hsl(255, 0, 0)
    assert h < 15 or h > 345
    assert s > 0.5
    assert 0.4 < l < 0.6


def test_hsl_rgb_roundtrip_primary() -> None:
    cases = [
        (0, 1.0, 0.5),
        (120, 1.0, 0.5),
        (240, 1.0, 0.5),
    ]
    for h, s, l in cases:
        r, g, b = hsl_to_rgb(h, s, l)
        h2, s2, l2 = rgb_to_hsl(r, g, b)
        assert abs(h - h2) < 2 or abs(h - h2) > 358
        assert abs(s - s2) < 0.05
        assert abs(l - l2) < 0.05


def test_infer_family_red() -> None:
    assert infer_color_family_from_hsl_or_rgb(200, 0, 0) == "red"


def test_infer_family_blue() -> None:
    assert infer_color_family_from_hsl_or_rgb(0, 0, 200) == "blue"


def test_infer_family_green() -> None:
    assert infer_color_family_from_hsl_or_rgb(0, 200, 0) == "green"


def test_infer_family_black() -> None:
    assert infer_color_family_from_hsl_or_rgb(10, 10, 10) == "black"


def test_infer_family_white() -> None:
    assert infer_color_family_from_hsl_or_rgb(250, 250, 250) == "white"


def test_infer_family_grey() -> None:
    assert infer_color_family_from_hsl_or_rgb(128, 128, 128) == "grey"


def test_infer_family_brown() -> None:
    # earthy brown-ish RGB
    family = infer_color_family_from_hsl_or_rgb(140, 90, 40)
    assert family == "brown"


def test_infer_family_pink() -> None:
    family = infer_color_family_from_hsl_or_rgb(255, 180, 200)
    assert family == "pink"


def test_saturation_and_lightness_buckets() -> None:
    assert saturation_bucket(0.8) == "vivid"
    assert lightness_bucket(0.1) == "dark"
    assert lightness_bucket(0.9) == "pale"
