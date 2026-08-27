"""Load xkcd Color Survey rgb.txt into CandidateColor records."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from colorrec.colorspace import hex_to_rgb, rgb_to_hsl
from colorrec.data.candidate_fields import prepare_color_fields
from colorrec.schemas import CandidateColor, normalize_hex

logger = logging.getLogger(__name__)

_HEX_PATTERN = re.compile(r"#?[0-9a-fA-F]{6}")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """Create a stable slug from a color name."""
    s = name.strip().lower()
    s = _SLUG_RE.sub("-", s).strip("-")
    return s or "unnamed"


def _parse_line(line: str) -> tuple[str, str] | None:
    """Parse one rgb.txt line into (name, hex)."""
    line = line.strip()
    if not line:
        return None

    hex_match = _HEX_PATTERN.search(line)
    if not hex_match:
        return None

    hex_raw = hex_match.group(0)
    hex_norm = normalize_hex(hex_raw)

    # Remove hex token from line to get name
    name_part = line.replace(hex_raw, " ").strip()
    if not name_part:
        return None

    # Collapse whitespace / tabs
    name = " ".join(name_part.split())
    if not name:
        return None

    return name, hex_norm


def load_xkcd_colors(path: str | Path) -> list[CandidateColor]:
    """Load xkcd colors from ``rgb.txt``.

    Supports ``name<TAB>#hex``, whitespace-separated, or ``#hex name`` order.
    Malformed lines log a warning and are skipped.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"xkcd rgb.txt not found at {path}. "
            "Please place it under data/raw/xkcd/rgb.txt"
        )

    colors: list[CandidateColor] = []
    seen_ids: set[str] = set()

    with path.open(encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            try:
                parsed = _parse_line(line)
                if parsed is None:
                    if line.strip():
                        logger.warning("Skipping unparseable xkcd line %d: %r", line_no, line.strip())
                    continue

                name, hex_val = parsed
                slug = slugify(name)
                color_id = f"xkcd:{slug}"
                if color_id in seen_ids:
                    color_id = f"xkcd:{slug}-{hex_val.lstrip('#').lower()}"
                seen_ids.add(color_id)

                r, g, b = hex_to_rgb(hex_val)
                h, s, l = rgb_to_hsl(r, g, b)
                display_name, family, _family_hsl, descriptor, metadata = prepare_color_fields(
                    name,
                    hex_val=hex_val,
                    r=r,
                    g=g,
                    b=b,
                    h=h,
                    s=s,
                    l=l,
                    extra_metadata={"line_no": line_no},
                )
                metadata["line_no"] = line_no

                colors.append(
                    CandidateColor(
                        color_id=color_id,
                        source="xkcd",
                        name=display_name,
                        hex=hex_val,
                        r=r,
                        g=g,
                        b=b,
                        h=round(h, 2),
                        s=round(s, 4),
                        l=round(l, 4),
                        family=family,
                        descriptor=descriptor,
                        metadata=metadata,
                    )
                )
            except Exception as exc:
                logger.warning("Failed to parse xkcd line %d: %s", line_no, exc)

    logger.info("Loaded %d xkcd colors from %s", len(colors), path)
    return colors
