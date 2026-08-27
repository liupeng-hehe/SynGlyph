#!/usr/bin/env python3
"""Generate 5000+ LAB-uniform teacher colors and training pairs."""

from __future__ import annotations

import argparse
import json
import logging

from colorrec.config import get_path, load_config, resolve_path
from colorrec.data.lab_uniform_teacher import (
    PALETTE_HEADER,
    PAIR_HEADER,
    build_rows,
    coverage_report,
    select_lab_uniform_colors,
    write_csv,
)
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate LAB-uniform teacher color CSVs.")
    parser.add_argument("--config", default="configs/distill_openai.yaml")
    parser.add_argument("--target", type=int, default=5000)
    parser.add_argument("--levels", type=int, default=64)
    parser.add_argument("--weight", type=float, default=2.4)
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))

    colors = select_lab_uniform_colors(target=args.target, levels=args.levels)
    pair_rows, palette_rows = build_rows(colors, weight=args.weight)

    pair_path = get_path(cfg, "raw_lab_uniform_teacher_pairs")
    palette_path = get_path(cfg, "raw_lab_uniform_teacher_palette")
    report_path = get_path(cfg, "lab_uniform_teacher_report_json")

    write_csv(pair_path, PAIR_HEADER, pair_rows)
    write_csv(palette_path, PALETTE_HEADER, palette_rows)
    report = coverage_report(colors)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    logger.info("Wrote %d pair rows -> %s", len(pair_rows), pair_path)
    logger.info("Wrote %d palette rows -> %s", len(palette_rows), palette_path)
    logger.info("Wrote report -> %s", report_path)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
