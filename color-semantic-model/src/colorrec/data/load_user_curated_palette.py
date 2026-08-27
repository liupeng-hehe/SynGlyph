"""Load user-curated palette CSV into CandidateColor records."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import pandas as pd

from colorrec.colorspace import hex_to_rgb, rgb_to_hsl
from colorrec.data.candidate_fields import prepare_color_fields
from colorrec.schemas import CandidateColor, normalize_hex

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"name", "hex"}
OPTIONAL_COLUMNS = {"family", "descriptor", "keywords", "weight"}


def _make_color_id(name: str, hex_val: str) -> str:
    digest = hashlib.sha256(f"{name.strip().lower()}:{hex_val.upper()}".encode()).hexdigest()[:12]
    return f"user_curated_palette:{digest}"


def load_user_curated_palette(path: str | Path) -> list[CandidateColor]:
    """Load curated palette rows as CandidateColor records."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"Curated palette not found at {path}. "
            "Create data/raw/user_curated/curated_palette.csv"
        )

    df = pd.read_csv(path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"curated_palette.csv missing columns: {sorted(missing)}")

    colors: list[CandidateColor] = []
    for idx, row in df.iterrows():
        raw_name = str(row["name"]).strip()
        if not raw_name:
            logger.warning("Skipping curated palette row %s: empty name", idx)
            continue

        hex_val = normalize_hex(str(row["hex"]))
        r, g, b = hex_to_rgb(hex_val)
        h, s, l = rgb_to_hsl(r, g, b)

        extra: dict = {"row_index": int(idx) if isinstance(idx, int) else idx}
        if "keywords" in df.columns and pd.notna(row.get("keywords")):
            extra["keywords"] = str(row["keywords"]).strip()
        if "weight" in df.columns and pd.notna(row.get("weight")):
            extra["weight"] = float(row["weight"])

        display_name, family_display, family_hsl, descriptor, metadata = prepare_color_fields(
            raw_name,
            hex_val=hex_val,
            r=r,
            g=g,
            b=b,
            h=h,
            s=s,
            l=l,
            extra_metadata=extra,
        )

        if "family" in df.columns and pd.notna(row.get("family")):
            family_display = str(row["family"]).strip().lower()
            metadata["family_display"] = family_display

        if "descriptor" in df.columns and pd.notna(row.get("descriptor")):
            descriptor = str(row["descriptor"]).strip()
        elif "family" in df.columns and pd.notna(row.get("family")):
            from colorrec.descriptors import build_descriptor_from_color

            descriptor = build_descriptor_from_color(
                display_name,
                family_display,
                h,
                s,
                l,
                metadata=metadata,
            )

        colors.append(
            CandidateColor(
                color_id=_make_color_id(display_name, hex_val),
                source="user_curated_palette",
                name=display_name,
                hex=hex_val,
                r=r,
                g=g,
                b=b,
                h=round(h, 2),
                s=round(s, 4),
                l=round(l, 4),
                family=family_display,
                descriptor=descriptor,
                metadata=metadata,
            )
        )

    logger.info("Loaded %d curated palette colors from %s", len(colors), path)
    return colors
