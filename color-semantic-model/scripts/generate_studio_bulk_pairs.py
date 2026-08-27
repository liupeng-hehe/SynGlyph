#!/usr/bin/env python3
"""Generate large Studio-format training pairs without OpenAI API calls."""

from __future__ import annotations

import argparse
import logging

from colorrec.config import get_path, load_config, resolve_path
from colorrec.data.openai_distill import (
    PALETTE_HEADER,
    SCHEMA_A_HEADER,
    merge_distill_into_user_curated,
)
from colorrec.data.studio_bulk_pairs import generate_studio_bulk_rows, write_bulk_csv
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate synthetic Studio bulk training pairs.")
    p.add_argument("--config", default="configs/distill_openai.yaml")
    p.add_argument("--max-pairs", type=int, default=800)
    p.add_argument("--colors-per-anchor", type=int, default=3)
    p.add_argument("--weight", type=float, default=2.8)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--max-combo-size", type=int, default=2, help="1=single feelings, 2=pairs, 3=triples")
    p.add_argument(
        "--merge-into-training",
        action="store_true",
        help="Append into user_pairs.csv + curated_palette.csv",
    )
    return p.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))

    palette_path = get_path(cfg, "raw_user_curated_palette")
    pairs_out = get_path(cfg, "raw_synthetic_studio_bulk_pairs")
    palette_out = get_path(cfg, "raw_synthetic_studio_bulk_palette")

    pair_rows, palette_rows = generate_studio_bulk_rows(
        palette_path=palette_path,
        max_pairs=args.max_pairs,
        colors_per_anchor=args.colors_per_anchor,
        pair_weight=args.weight,
        seed=args.seed,
        max_combo_size=args.max_combo_size,
    )

    write_bulk_csv(pairs_out, SCHEMA_A_HEADER, pair_rows)
    write_bulk_csv(palette_out, PALETTE_HEADER, palette_rows)
    logger.info("Wrote %d pair rows → %s", len(pair_rows), pairs_out)
    logger.info("Wrote %d palette rows → %s", len(palette_rows), palette_out)

    if args.merge_into_training:
        stats = merge_distill_into_user_curated(
            distill_pairs_path=pairs_out,
            user_pairs_path=get_path(cfg, "raw_user_curated"),
            distill_palette_path=palette_out,
            curated_palette_path=palette_path,
        )
        logger.info("Merged into training CSVs: %s", stats)


if __name__ == "__main__":
    main()
