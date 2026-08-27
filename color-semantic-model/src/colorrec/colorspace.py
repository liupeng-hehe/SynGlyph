"""Color space conversions and family inference (no heavy image deps)."""

from __future__ import annotations

import colorsys
import re
from typing import Optional

_HEX_TOKEN_RE = re.compile(r"#?[0-9A-Fa-f]{6}\b")
_PAREN_ONLY_HEX_RE = re.compile(r"^[\s#0-9A-Fa-f]+$", re.IGNORECASE)
_GLUE_HEX_SUFFIX_RE = re.compile(r"([A-Za-z])([0-9A-Fa-f]{6})$")
_HEX_CODE_PAREN_RE = re.compile(
    r"^[#0-9A-Fa-f]{3,8}\s*\(([^)]+)\)\s*$",
    re.IGNORECASE,
)


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    """Parse ``#RRGGBB`` (or ``RRGGBB``) to RGB 0-255."""
    s = hex_str.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", s):
        raise ValueError(f"Invalid hex string: {hex_str!r}")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB 0-255 to ``#RRGGBB`` uppercase."""
    for c in (r, g, b):
        if not 0 <= c <= 255:
            raise ValueError(f"RGB channel out of range: {(r, g, b)}")
    return f"#{r:02X}{g:02X}{b:02X}"


def _rgb_unit(r: int, g: int, b: int) -> tuple[float, float, float]:
    return r / 255.0, g / 255.0, b / 255.0


def _rgb_from_unit(r: float, g: float, b: float) -> tuple[int, int, int]:
    return (
        max(0, min(255, int(round(r * 255)))),
        max(0, min(255, int(round(g * 255)))),
        max(0, min(255, int(round(b * 255)))),
    )


def rgb_to_hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert RGB to HSL.

    Returns ``(h, s, l)`` where h is degrees 0-360 and s/l are 0-1.

    Note: Python :mod:`colorsys` uses HLS order internally; this wrapper
    exposes HSL = (hue, saturation, lightness).
    """
    ru, gu, bu = _rgb_unit(r, g, b)
    h_unit, l_unit, s_unit = colorsys.rgb_to_hls(ru, gu, bu)
    h_deg = h_unit * 360.0
    return h_deg, s_unit, l_unit


def hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """Convert HSL (h degrees 0-360, s/l 0-1) to RGB 0-255."""
    h_unit = (h % 360.0) / 360.0
    ru, gu, bu = colorsys.hls_to_rgb(h_unit, l, s)
    return _rgb_from_unit(ru, gu, bu)


def _normalize_hue(h: float) -> float:
    h = h % 360.0
    if h < 0:
        h += 360.0
    return h


def _strip_hex_tokens(text: str, hex_val: str | None = None) -> str:
    """Remove hex tokens from a display name string."""
    s = text
    if hex_val:
        compact = hex_val.lstrip("#")
        for token in (hex_val, f"#{compact}", compact, compact.upper(), compact.lower()):
            s = re.sub(re.escape(token), " ", s, flags=re.IGNORECASE)
    tokens = _HEX_TOKEN_RE.findall(s)
    for token in tokens:
        dup_pattern = rf"(?:\s*{re.escape(token)}\s*){{2,}}"
        s = re.sub(dup_pattern, " ", s, flags=re.IGNORECASE)
    s = _HEX_TOKEN_RE.sub(" ", s)
    return s


def clean_display_name(name: str, hex: str | None = None) -> str:
    """Normalize noisy Color-Pedia / catalog display names."""
    raw = " ".join(str(name).strip().split())
    if not raw:
        return raw

    paren = _HEX_CODE_PAREN_RE.match(raw)
    if paren:
        inner = paren.group(1).strip()
        if inner and not _PAREN_ONLY_HEX_RE.match(inner):
            if not re.fullmatch(r"(?i)(hexadecimal|approx\.?|approximate)", inner):
                return _finalize_display_name(_strip_hex_tokens(inner, hex))

    s = raw
    s = re.sub(r"(?i)\(hexadecimal\)", " ", s)
    s = re.sub(r"(?i)\(approx\.?\)", " ", s)
    s = re.sub(r"(?i)\(approximate\)", " ", s)

    def _paren_repl(match: re.Match[str]) -> str:
        inner = match.group(1).strip()
        if _PAREN_ONLY_HEX_RE.match(inner):
            return " "
        if re.fullmatch(r"(?i)(hexadecimal|approx\.?|approximate)", inner):
            return " "
        return f" {inner} "

    s = re.sub(r"\(([^)]+)\)", _paren_repl, s)
    s = _strip_hex_tokens(s, hex)
    s = _GLUE_HEX_SUFFIX_RE.sub(r"\1", s)
    s = re.sub(r"(?i)^(?:approx\.?|approximate)\s+", "", s)
    return _finalize_display_name(s)


def _finalize_display_name(text: str) -> str:
    s = " ".join(text.split())
    s = s.strip(" -:|,")
    return s or "unnamed"


def is_weird_display_name(name: str) -> bool:
    """Heuristic for catalog names that need cleaning."""
    raw = str(name).strip()
    if not raw:
        return False
    if re.search(r"#?[0-9A-Fa-f]{6}.*#?[0-9A-Fa-f]{6}", raw):
        return True
    if re.search(r"(?i)hexadecimal", raw):
        return True
    if _GLUE_HEX_SUFFIX_RE.search(raw):
        return True
    cleaned = clean_display_name(raw)
    return cleaned != raw and len(raw) - len(cleaned) >= 3


def _contains_color_word(name: str, words: tuple[str, ...]) -> bool:
    n = name.lower()
    for word in words:
        if " " in word:
            if word in n:
                return True
        elif re.search(rf"\b{re.escape(word)}\b", n):
            return True
    return False


def infer_semantic_family(
    name: str,
    h: float,
    s: float,
    l: float,
    hsl_family: str,
) -> str:
    """Infer display/semantic family using color words in the name, then HSL fallback."""
    n = clean_display_name(name).lower()

    if _contains_color_word(n, ("white", "ivory", "cream", "linen", "champagne")):
        return "white"
    if _contains_color_word(n, ("black", "charcoal", "ink", "midnight")):
        return "black"
    if _contains_color_word(n, ("coffee", "cocoa", "chocolate", "earth", "sepia")):
        return "brown"
    if _contains_color_word(n, ("gold", "honey", "mustard", "sunny yellow")) or (
        _contains_color_word(n, ("yellow",)) and "green" not in n
    ):
        return "yellow"
    if _contains_color_word(n, ("burnt sienna", "terracotta", "tangerine", "burnt orange")):
        return "orange"
    if _contains_color_word(n, ("sienna", "brown")):
        return "brown"
    if _contains_color_word(n, ("orange", "coral")):
        return "orange"
    if _contains_color_word(n, ("rose", "hot pink", "fuchsia", "magenta", "blush")):
        return "pink"
    if _contains_color_word(n, ("red", "crimson", "scarlet", "maroon", "wine", "burgundy")):
        return "red"
    if _contains_color_word(n, ("green", "sage", "olive", "mint", "forest", "moss")):
        return "green"
    if _contains_color_word(n, ("blue", "cyan", "navy", "teal", "sapphire")):
        return "blue"
    if _contains_color_word(n, ("purple", "violet", "lavender", "plum", "periwinkle")):
        return "purple"

    return hsl_family


def infer_color_family_from_hsl_or_rgb(
    r: int,
    g: int,
    b: int,
    h: Optional[float] = None,
    s: Optional[float] = None,
    l: Optional[float] = None,
) -> str:
    """Infer broad color family using simple HSL rules (v1)."""
    if h is None or s is None or l is None:
        h, s, l = rgb_to_hsl(r, g, b)
    h = _normalize_hue(h)

    if l < 0.12:
        return "black"
    if l > 0.92 and s < 0.15:
        return "white"
    if s < 0.12:
        return "grey"

    # Brown before warm hue families
    if 15 <= h < 50 and s >= 0.20 and 0.15 <= l <= 0.55:
        return "brown"

    # Pink before red (overlapping hue, higher lightness)
    if (h >= 330 or h < 15) and l >= 0.55 and s >= 0.25:
        return "pink"

    if h >= 345 or h < 15:
        return "red"
    if 15 <= h < 45:
        return "orange"
    if 45 <= h < 70:
        return "yellow"
    if 70 <= h < 170:
        return "green"
    if 170 <= h < 260:
        return "blue"
    if 260 <= h < 330:
        return "purple"

    return "grey"


def saturation_bucket(s: float) -> str:
    """Label saturation level for descriptor generation."""
    if s > 0.70:
        return "vivid"
    if s > 0.45:
        return "colorful"
    if s > 0.20:
        return "muted"
    return "soft"


def lightness_bucket(l: float) -> str:
    """Label lightness level for descriptor generation."""
    if l < 0.25:
        return "dark"
    if l < 0.45:
        return "rich"
    if l <= 0.70:
        return "balanced"
    if l <= 0.85:
        return "light"
    return "pale"


def warmth_score(h: float) -> float:
    """Return warmth in [0, 1] from hue (0=cool blue, 1=warm red)."""
    h = _normalize_hue(h)
    # Peak warmth at red (0/360), coolest near blue (240)
    import math

    rad = math.radians(h)
    # cos peaks at h=0 (warm) and min at h=180; shift so blue ~ 240 is cool
    score = (math.cos(rad) + 1.0) / 2.0
    return max(0.0, min(1.0, score))
