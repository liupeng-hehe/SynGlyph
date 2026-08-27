"""Natural-language color descriptor generation."""

from __future__ import annotations

from typing import Any, Optional

from colorrec.colorspace import lightness_bucket, saturation_bucket

MAX_DESCRIPTOR_LEN = 256

FAMILY_ASSOCIATIONS: dict[str, list[str]] = {
    "red": ["passionate", "intense", "energetic"],
    "orange": ["warm", "friendly", "energetic"],
    "yellow": ["bright", "cheerful", "sunny"],
    "green": ["natural", "fresh", "organic"],
    "blue": ["calm", "clean", "trustworthy"],
    "purple": ["creative", "mysterious", "luxurious"],
    "pink": ["soft", "romantic", "gentle"],
    "brown": ["earthy", "rustic", "grounded"],
    "grey": ["neutral", "minimal", "professional"],
    "black": ["elegant", "powerful", "dramatic"],
    "white": ["clean", "pure", "minimal"],
}

WARM_FAMILIES = {"red", "orange", "yellow", "brown", "pink"}
COOL_FAMILIES = {"blue", "green", "purple"}
NEUTRAL_FAMILIES = {"grey", "black", "white"}

METADATA_TEXT_KEYS = (
    "keywords",
    "keyword",
    "tags",
    "tag",
    "mood",
    "moods",
    "emotion",
    "emotions",
    "symbolism",
    "symbolic_meaning",
    "personality",
    "use_case",
    "use_cases",
)


def _lightness_phrases(l: float) -> list[str]:
    bucket = lightness_bucket(l)
    phrases = [bucket]
    if bucket == "dark":
        phrases.append("deep")
    elif bucket == "pale":
        pass  # pale already captured
    elif bucket == "light":
        pass
    return phrases


def _saturation_phrases(s: float) -> list[str]:
    if s > 0.70:
        return ["vivid", "saturated", "bold"]
    if s > 0.45:
        return ["colorful"]
    if s > 0.20:
        return ["muted"]
    return ["soft", "desaturated"]


def _warmth_phrases(family: str) -> list[str]:
    if family in WARM_FAMILIES:
        return ["warm"]
    if family in COOL_FAMILIES:
        return ["cool"]
    if family in NEUTRAL_FAMILIES:
        if family == "white":
            return ["neutral", "clean"]
        if family == "black":
            return ["neutral", "dramatic"]
        return ["neutral"]
    return []


def _extract_metadata_terms(metadata: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    for key in METADATA_TEXT_KEYS:
        if key not in metadata:
            continue
        val = metadata[key]
        if val is None:
            continue
        if isinstance(val, str):
            parts = val.replace(",", " ").replace(";", " ").split()
            terms.extend(p.strip().lower() for p in parts if p.strip())
        elif isinstance(val, (list, tuple, set)):
            for item in val:
                if item is None:
                    continue
                s = str(item).strip().lower()
                if s:
                    terms.append(s)
        else:
            s = str(val).strip().lower()
            if s:
                terms.append(s)
    return terms


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def build_descriptor_from_color(
    name: str,
    family: str,
    h: float,
    s: float,
    l: float,
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    """Build a comma-separated natural language descriptor for a color."""
    meta = metadata or {}
    parts: list[str] = [
        name.strip().lower(),
        f"{family} family",
    ]
    parts.extend(_lightness_phrases(l))
    parts.extend(_saturation_phrases(s))
    parts.extend(_warmth_phrases(family))
    parts.extend(FAMILY_ASSOCIATIONS.get(family, []))
    parts.extend(_extract_metadata_terms(meta))

    deduped = _dedupe_preserve(parts)
    descriptor = ", ".join(deduped)
    if len(descriptor) > MAX_DESCRIPTOR_LEN:
        descriptor = descriptor[: MAX_DESCRIPTOR_LEN - 3].rsplit(", ", 1)[0]
    return descriptor
