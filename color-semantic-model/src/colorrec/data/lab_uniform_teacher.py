"""Generate LAB-uniform teacher colors for broad color coverage."""

from __future__ import annotations

import csv
import math
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from colorrec.colorspace import infer_color_family_from_hsl_or_rgb, rgb_to_hex, rgb_to_hsl


PAIR_HEADER = [
    "anchor_text",
    "positive_color_name",
    "positive_hex",
    "positive_descriptor",
    "color_family",
    "weight",
]

PALETTE_HEADER = ["name", "hex", "family", "descriptor", "keywords", "weight"]

LENS_BY_FAMILY: dict[str, list[str]] = {
    "red": ["as pulse", "as alarm", "as velvet wound", "as ceremonial heat"],
    "pink": ["as tenderness", "as vanity", "as first blush", "as powdered light"],
    "orange": ["as ember", "as harvest", "as signal warmth", "as late sun"],
    "yellow": ["as candle", "as paper light", "as offering", "as orchard sweetness"],
    "green": ["as leaf shade", "as mineral calm", "as renewal", "as hidden growth"],
    "blue": ["as distance", "as rain glass", "as harbor air", "as evening signal"],
    "purple": ["as bruise", "as ritual veil", "as theatrical dusk", "as secret luxury"],
    "brown": ["as archive", "as earth memory", "as old wood", "as tobacco room"],
    "grey": ["as smoke", "as withheld speech", "as weathered silver", "as quiet ash"],
    "white": ["as linen", "as blank page", "as winter breath", "as soft clarity"],
    "black": ["as midnight", "as ink", "as burnt silence", "as deep velvet"],
}

NOUNS_BY_FAMILY: dict[str, list[str]] = {
    "red": ["pulse", "ember", "wound", "theater", "wine"],
    "pink": ["blush", "silk", "rose", "mirror", "letter"],
    "orange": ["candle", "harvest", "apricot", "terracotta", "flame"],
    "yellow": ["gold", "parchment", "honey", "marigold", "lamp"],
    "green": ["sage", "fern", "garden", "glass", "moss"],
    "blue": ["harbor", "rain", "distance", "slate", "mercury"],
    "purple": ["plum", "violet", "veil", "bruise", "velvet"],
    "brown": ["archive", "sepia", "wood", "coffee", "umber"],
    "grey": ["ash", "smoke", "stone", "silver", "fog"],
    "white": ["linen", "paper", "ivory", "wool", "snow"],
    "black": ["ink", "midnight", "charcoal", "shadow", "velvet"],
}

TOP_ADJECTIVES = [
    "vivid",
    "saturated",
    "bold",
    "cool",
    "warm",
    "balanced",
    "rich",
    "deep",
    "dark",
    "calm",
    "fresh",
    "natural",
    "organic",
    "light",
    "energetic",
    "clean",
    "colorful",
    "vibrant",
    "mysterious",
    "muted",
    "creative",
    "intense",
    "bright",
    "luxurious",
    "earthy",
    "serene",
    "passionate",
    "sage",
    "grounded",
    "romantic",
    "rustic",
    "gentle",
    "elegant",
    "dramatic",
    "cheerful",
]


@dataclass(frozen=True)
class LabColor:
    hex: str
    r: int
    g: int
    b: int
    l_lab: float
    a_lab: float
    b_lab: float
    h: float
    s: float
    l_hsl: float
    family: str


def _srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def rgb_array_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Vectorized sRGB 0-255 -> CIE Lab (D65)."""
    srgb = rgb.astype(np.float64) / 255.0
    lin = _srgb_to_linear(srgb)
    matrix = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float64,
    )
    xyz = lin @ matrix.T
    white = np.array([0.95047, 1.00000, 1.08883], dtype=np.float64)
    xyz_scaled = xyz / white
    eps = 216 / 24389
    kappa = 24389 / 27
    f = np.where(xyz_scaled > eps, np.cbrt(xyz_scaled), (kappa * xyz_scaled + 16) / 116)
    l_val = 116 * f[:, 1] - 16
    a_val = 500 * (f[:, 0] - f[:, 1])
    b_val = 200 * (f[:, 1] - f[:, 2])
    return np.column_stack([l_val, a_val, b_val])


def _candidate_rgb_grid(levels: int = 64) -> np.ndarray:
    vals = np.linspace(0, 255, levels).round().astype(np.uint8)
    rr, gg, bb = np.meshgrid(vals, vals, vals, indexing="ij")
    return np.column_stack([rr.ravel(), gg.ravel(), bb.ravel()]).astype(np.uint8)


def select_lab_uniform_colors(
    *,
    target: int = 5000,
    levels: int = 64,
    bins: tuple[int, int, int] = (20, 24, 24),
) -> list[LabColor]:
    """Select sRGB colors that are approximately evenly distributed in Lab space."""
    rgb = _candidate_rgb_grid(levels=levels)
    lab = rgb_array_to_lab(rgb)

    # Normalize to observed sRGB Lab gamut, then bin. This keeps all selected colors displayable.
    mins = lab.min(axis=0)
    maxs = lab.max(axis=0)
    norm = (lab - mins) / (maxs - mins)
    bin_idx = np.floor(norm * np.array(bins)).astype(int)
    bin_idx = np.minimum(bin_idx, np.array(bins) - 1)
    flat_bin = (
        bin_idx[:, 0] * bins[1] * bins[2]
        + bin_idx[:, 1] * bins[2]
        + bin_idx[:, 2]
    )

    centers = (bin_idx + 0.5) / np.array(bins)
    dist_to_center = np.linalg.norm(norm - centers, axis=1)
    order = np.lexsort((dist_to_center, flat_bin))

    selected: list[int] = []
    seen_bins: set[int] = set()
    leftovers: list[int] = []
    for idx in order:
        fb = int(flat_bin[idx])
        if fb not in seen_bins:
            selected.append(int(idx))
            seen_bins.add(fb)
        else:
            leftovers.append(int(idx))
        if len(selected) >= target:
            break

    if len(selected) < target:
        # Fill remaining slots with well-spread leftovers by sweeping the sorted leftovers.
        step = max(1, len(leftovers) // max(1, target - len(selected)))
        for idx in leftovers[::step]:
            selected.append(idx)
            if len(selected) >= target:
                break

    selected = selected[:target]
    out: list[LabColor] = []
    for idx in selected:
        r, g, b = (int(x) for x in rgb[idx])
        h, s, l_hsl = rgb_to_hsl(r, g, b)
        family = infer_color_family_from_hsl_or_rgb(r, g, b, h=h, s=s, l=l_hsl)
        out.append(
            LabColor(
                hex=rgb_to_hex(r, g, b),
                r=r,
                g=g,
                b=b,
                l_lab=float(lab[idx, 0]),
                a_lab=float(lab[idx, 1]),
                b_lab=float(lab[idx, 2]),
                h=h,
                s=s,
                l_hsl=l_hsl,
                family=family,
            )
        )
    # Stable, human-scannable ordering by Lab lightness and hue-ish axes.
    return sorted(out, key=lambda c: (round(c.l_lab, 1), round(c.a_lab, 1), round(c.b_lab, 1)))


def tone_adjectives(c: LabColor) -> list[str]:
    words: list[str] = []
    if c.l_lab < 25:
        words.append("dark")
    elif c.l_lab < 45:
        words.append("deep")
    elif c.l_lab < 70:
        words.append("balanced")
    elif c.l_lab < 88:
        words.append("light")
    else:
        words.append("pale")

    chroma = math.sqrt(c.a_lab * c.a_lab + c.b_lab * c.b_lab)
    if chroma > 85:
        words.append("vivid")
    elif chroma > 55:
        words.append("colorful")
    elif chroma > 28:
        words.append("muted")
    else:
        words.append("soft")

    if c.b_lab > 24:
        words.append("warm")
    elif c.b_lab < -18:
        words.append("cool")
    else:
        words.append("quiet")

    # Add one high-frequency adjective from the existing corpus, deterministic by hex.
    idx = (c.r * 3 + c.g * 5 + c.b * 7) % len(TOP_ADJECTIVES)
    extra = TOP_ADJECTIVES[idx]
    if extra not in words:
        words.append(extra)
    return words


def color_name(c: LabColor, index: int) -> str:
    nouns = NOUNS_BY_FAMILY.get(c.family, [c.family])
    noun = nouns[index % len(nouns)]
    adjs = tone_adjectives(c)
    if c.family in {"white", "grey", "black"}:
        return f"{adjs[0]} {noun} {index:04d}"
    return f"{adjs[1]} {noun} {index:04d}"


def anchor_text(c: LabColor, name: str, index: int) -> str:
    lenses = LENS_BY_FAMILY.get(c.family, ["as atmosphere"])
    lens = lenses[index % len(lenses)]
    adjs = tone_adjectives(c)
    noun = NOUNS_BY_FAMILY.get(c.family, [c.family])[index % len(NOUNS_BY_FAMILY.get(c.family, [c.family]))]
    return f"{noun} {lens}, {', '.join(adjs[:3])} {c.family}"


def descriptor(c: LabColor, name: str, anchor: str) -> str:
    adjs = tone_adjectives(c)
    chroma = math.sqrt(c.a_lab * c.a_lab + c.b_lab * c.b_lab)
    return (
        f"{name}, {c.family} family, {', '.join(adjs)}, "
        f"LAB L {c.l_lab:.1f} a {c.a_lab:.1f} b {c.b_lab:.1f}, "
        f"chroma {chroma:.1f}, {anchor}, "
        "broad gamut teacher color sampled for even LAB color-map coverage"
    )


def build_rows(colors: list[LabColor], *, weight: float = 2.4) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    pair_rows: list[dict[str, str]] = []
    palette_rows: list[dict[str, str]] = []
    for i, c in enumerate(colors):
        name = color_name(c, i)
        anchor = anchor_text(c, name, i)
        desc = descriptor(c, name, anchor)
        pair_rows.append(
            {
                "anchor_text": anchor,
                "positive_color_name": name,
                "positive_hex": c.hex,
                "positive_descriptor": desc,
                "color_family": c.family,
                "weight": str(weight),
            }
        )
        palette_rows.append(
            {
                "name": name,
                "hex": c.hex,
                "family": c.family,
                "descriptor": desc,
                "keywords": anchor,
                "weight": "0.8",
            }
        )
    return pair_rows, palette_rows


def write_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def coverage_report(colors: list[LabColor]) -> dict[str, object]:
    fam = Counter(c.family for c in colors)
    lab = np.array([[c.l_lab, c.a_lab, c.b_lab] for c in colors], dtype=np.float64)
    return {
        "count": len(colors),
        "unique_hex": len({c.hex for c in colors}),
        "family_counts": dict(sorted(fam.items())),
        "lab_min": [round(float(x), 3) for x in lab.min(axis=0)],
        "lab_max": [round(float(x), 3) for x in lab.max(axis=0)],
        "lab_mean": [round(float(x), 3) for x in lab.mean(axis=0)],
        "lab_std": [round(float(x), 3) for x in lab.std(axis=0)],
    }
