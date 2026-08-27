#!/usr/bin/env python3
"""Distill OpenAI Color Studio suggestions into user_curated training CSVs.

Workflow (scheme C):
  1. Run this script on seeds (passage + feelings) → openai_distill_pairs.csv + palette
  2. merge --merge-into-training to append into user_pairs.csv + curated_palette.csv
  3. Rebuild bank + pairs + fine-tune (see docs/DISTILL_OPENAI_TRAINING.md)

Requires OPENAI_API_KEY in the environment.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.data.openai_distill import (
    PALETTE_HEADER,
    SCHEMA_A_HEADER,
    DistillSeed,
    append_audit_record,
    append_csv_rows,
    build_studio_anchor,
    call_openai_distill,
    distill_row_to_csv_dict,
    distill_row_to_palette_dict,
    load_seeds_jsonl,
    merge_distill_into_user_curated,
    openai_draft_to_row,
    slug_anchor,
)
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Distill OpenAI color pairs for colorrec training.")
    p.add_argument("--config", default="configs/distill_openai.yaml")
    p.add_argument("--seeds", default=None, help="JSONL seeds file (default from config)")
    p.add_argument("--variants", type=int, default=None, help="Extra Try-another variants per seed (0 = primary only)")
    p.add_argument("--limit", type=int, default=None, help="Max seeds to process")
    p.add_argument("--model", default=None, help="OpenAI model override")
    p.add_argument("--weight", type=float, default=None, help="Training pair weight override")
    p.add_argument("--sleep", type=float, default=0.5, help="Seconds between API calls")
    p.add_argument("--dry-run", action="store_true", help="Print anchors only, no API calls")
    p.add_argument(
        "--merge-into-training",
        action="store_true",
        help="After distillation, merge distill CSVs into user_pairs.csv + curated_palette.csv",
    )
    return p.parse_args()


def _default_seeds() -> list[DistillSeed]:
    """Small starter set aligned with Color Studio feeling presets."""
    passages = [
        "The horn section lingered over empty chairs long after the room had gone quiet.",
        "Morning light slid across the page like honey, slow and patient.",
        "Neon rain stitched the alley into a fever dream of distant engines.",
        "She folded the letter twice, as if softness could hide what it said.",
    ]
    feeling_sets = [
        ["warm", "nostalgic"],
        ["calm", "luminous"],
        ["mysterious", "restless"],
        ["melancholic", "tender"],
        ["fierce", "warm"],
        ["fresh", "calm"],
    ]
    out: list[DistillSeed] = []
    for feelings in feeling_sets:
        for passage in passages:
            out.append(DistillSeed(passage=passage, feelings=feelings))
    return out


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))

    seeds_path = Path(args.seeds) if args.seeds else get_path(cfg, "distill_seeds_jsonl")
    if seeds_path.exists():
        seeds = load_seeds_jsonl(seeds_path)
        logger.info("Loaded %d seeds from %s", len(seeds), seeds_path)
    else:
        seeds = _default_seeds()
        logger.warning("Seeds file missing (%s); using %d built-in seeds", seeds_path, len(seeds))

    if args.limit is not None:
        seeds = seeds[: max(0, args.limit)]

    variants = (
        int(args.variants)
        if args.variants is not None
        else int(cfg.distill.get("variants_per_seed", 1))
    )
    weight = float(args.weight if args.weight is not None else cfg.distill.get("pair_weight", 3.5))
    model = str(args.model or cfg.distill.get("openai_model", "gpt-4o-mini"))

    pairs_out = get_path(cfg, "raw_openai_distill_pairs")
    palette_out = get_path(cfg, "raw_openai_distill_palette")
    audit_out = get_path(cfg, "raw_openai_distill_audit")

    if args.dry_run:
        for seed in seeds:
            anchor = build_studio_anchor(seed.passage, seed.feelings)
            print(f"- {anchor[:100]}{'…' if len(anchor) > 100 else ''}")
        print(f"(dry-run) would write pairs → {pairs_out}")
        return

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        logger.error("Set OPENAI_API_KEY before running distillation.")
        sys.exit(1)

    pair_rows: list[dict[str, str]] = []
    palette_rows: list[dict[str, str]] = []
    seen_palette_hex: set[str] = set()

    for seed_idx, seed in enumerate(seeds):
        for variant in range(variants + 1):
            anchor = build_studio_anchor(seed.passage, seed.feelings)
            logger.info(
                "Distilling seed %d/%d variant %d: %s",
                seed_idx + 1,
                len(seeds),
                variant,
                slug_anchor(anchor),
            )
            try:
                draft = call_openai_distill(
                    api_key=api_key,
                    passage=seed.passage,
                    feelings=seed.feelings,
                    model=model,
                    variant=variant,
                )
                row = openai_draft_to_row(
                    draft,
                    anchor=anchor,
                    feelings=seed.feelings,
                    passage=seed.passage,
                    weight=weight,
                    variant=variant,
                    model=model,
                )
            except Exception as exc:
                logger.error("OpenAI failed for %s v%d: %s", slug_anchor(anchor), variant, exc)
                append_audit_record(
                    audit_out,
                    {
                        "ok": False,
                        "anchor": anchor,
                        "variant": variant,
                        "error": str(exc),
                    },
                )
                continue

            pair_rows.append(distill_row_to_csv_dict(row))
            append_audit_record(
                audit_out,
                {
                    "ok": True,
                    "anchor": anchor,
                    "variant": variant,
                    "model": model,
                    "draft": draft,
                    "row": distill_row_to_csv_dict(row),
                },
            )

            hx = row.positive_hex.upper()
            if hx not in seen_palette_hex:
                seen_palette_hex.add(hx)
                palette_rows.append(distill_row_to_palette_dict(row))

            if args.sleep > 0:
                time.sleep(args.sleep)

    n_pairs = append_csv_rows(pairs_out, SCHEMA_A_HEADER, pair_rows)
    n_palette = append_csv_rows(palette_out, PALETTE_HEADER, palette_rows)
    logger.info("Wrote %d pair rows → %s", n_pairs, pairs_out)
    logger.info("Wrote %d palette rows → %s", n_palette, palette_out)
    logger.info("Audit log → %s", audit_out)

    if args.merge_into_training:
        stats = merge_distill_into_user_curated(
            distill_pairs_path=pairs_out,
            user_pairs_path=get_path(cfg, "raw_user_curated"),
            distill_palette_path=palette_out,
            curated_palette_path=get_path(cfg, "raw_user_curated_palette"),
        )
        logger.info("Merged into training CSVs: %s", stats)
        print(
            "\nNext steps:\n"
            f"  python -m colorrec.data.build_candidate_bank --config {args.config}\n"
            f"  python -m colorrec.data.build_training_pairs --config {args.config}\n"
            "  # then fine-tune with your train config (local or HPC)\n"
        )


if __name__ == "__main__":
    main()
