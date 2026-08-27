"""Build merged candidate color bank from configured sources."""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd
from omegaconf import DictConfig

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.colorspace import is_weird_display_name
from colorrec.data.load_color_pedia import get_last_color_pedia_load_stats, load_color_pedia_colors
from colorrec.data.load_user_curated_palette import load_user_curated_palette
from colorrec.data.load_xkcd import load_xkcd_colors
from colorrec.logging_utils import set_seed, setup_logging
from colorrec.schemas import CandidateColor

logger = logging.getLogger(__name__)


@dataclass
class SourceLoadReport:
    source: str
    loaded: int = 0
    skipped: int = 0
    skip_reasons: dict[str, int] = field(default_factory=dict)


@dataclass
class BuildReport:
    raw_by_source: dict[str, int] = field(default_factory=dict)
    source_reports: list[SourceLoadReport] = field(default_factory=list)
    raw_total: int = 0
    after_dedupe: int = 0
    duplicate_count: int = 0
    dedupe_enabled: bool = True


def _normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _dedupe_key(color: CandidateColor) -> tuple[str, str]:
    return _normalize_name(color.name), color.hex.upper()


def _richness_score(color: CandidateColor) -> tuple[int, int]:
    meta_len = len(json.dumps(color.metadata, sort_keys=True))
    return len(color.descriptor), meta_len


def dedupe_colors(colors: Iterable[CandidateColor]) -> list[CandidateColor]:
    """Keep richest record per (normalized name, hex) pair."""
    best: dict[tuple[str, str], CandidateColor] = {}
    for color in colors:
        key = _dedupe_key(color)
        existing = best.get(key)
        if existing is None or _richness_score(color) > _richness_score(existing):
            best[key] = color
    return list(best.values())


def load_all_sources(cfg: DictConfig) -> tuple[list[CandidateColor], BuildReport]:
    """Load colors from all enabled sources in config."""
    colors: list[CandidateColor] = []
    report = BuildReport()

    if cfg.data.sources.get("xkcd", False):
        xkcd_path = get_path(cfg, "raw_xkcd")
        logger.info("Loading xkcd from %s", xkcd_path)
        xkcd_colors = load_xkcd_colors(xkcd_path)
        colors.extend(xkcd_colors)
        report.raw_by_source["xkcd"] = len(xkcd_colors)
        report.source_reports.append(SourceLoadReport(source="xkcd", loaded=len(xkcd_colors)))

    if cfg.data.sources.get("color_pedia", False):
        logger.info("Loading Color-Pedia")
        cp_colors = load_color_pedia_colors(cfg)
        colors.extend(cp_colors)
        report.raw_by_source["color_pedia"] = len(cp_colors)
        cp_stats = get_last_color_pedia_load_stats()
        if cp_stats is not None:
            report.source_reports.append(
                SourceLoadReport(
                    source="color_pedia",
                    loaded=cp_stats.loaded,
                    skipped=cp_stats.skipped,
                    skip_reasons=dict(cp_stats.skip_reasons),
                )
            )
        else:
            report.source_reports.append(
                SourceLoadReport(source="color_pedia", loaded=len(cp_colors))
            )

    if cfg.data.sources.get("user_curated_palette", False):
        palette_path = get_path(cfg, "raw_user_curated_palette")
        logger.info("Loading user curated palette from %s", palette_path)
        palette_colors = load_user_curated_palette(palette_path)
        colors.extend(palette_colors)
        report.raw_by_source["user_curated_palette"] = len(palette_colors)
        report.source_reports.append(
            SourceLoadReport(source="user_curated_palette", loaded=len(palette_colors))
        )

    report.raw_total = len(colors)
    return colors, report


def _family_hsl_distribution(colors: list[CandidateColor]) -> Counter:
    counts: Counter = Counter()
    for color in colors:
        family_hsl = color.metadata.get("family_hsl", color.family)
        counts[str(family_hsl)] += 1
    return counts


def _weird_name_count(colors: list[CandidateColor]) -> int:
    count = 0
    for color in colors:
        raw = str(color.metadata.get("raw_name", color.name))
        if is_weird_display_name(raw) or raw != color.name:
            count += 1
    return count


def _descriptor_length_stats(colors: list[CandidateColor]) -> dict[str, float]:
    if not colors:
        return {"min": 0.0, "max": 0.0, "mean": 0.0}
    lengths = [len(c.descriptor) for c in colors]
    return {
        "min": float(min(lengths)),
        "max": float(max(lengths)),
        "mean": float(sum(lengths) / len(lengths)),
    }


def write_outputs(
    colors: list[CandidateColor],
    *,
    parquet_path: Path,
    jsonl_path: Path,
    report_path: Path,
    build_report: BuildReport,
) -> None:
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    records = [c.to_json_dict() for c in colors]
    df = pd.DataFrame(records)
    df.to_parquet(parquet_path, index=False)

    with jsonl_path.open("w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    by_source = Counter(c.source for c in colors)
    by_family = Counter(c.family for c in colors)
    by_family_hsl = _family_hsl_distribution(colors)
    weird_names = _weird_name_count(colors)
    desc_stats = _descriptor_length_stats(colors)

    lines = [
        "# Candidate Color Bank — Schema Report",
        "",
        f"- Total raw colors loaded: **{build_report.raw_total}**",
        f"- Total after dedupe: **{len(colors)}**",
        f"- Duplicate rows removed: **{build_report.duplicate_count}**",
        f"- Dedupe enabled: **{build_report.dedupe_enabled}**",
        "",
        "## Count by source (raw loaded)",
        "",
    ]
    for src, cnt in sorted(build_report.raw_by_source.items()):
        lines.append(f"- {src}: {cnt}")

    lines.extend(["", "## Count by source (after dedupe)", ""])
    for src, cnt in sorted(by_source.items()):
        lines.append(f"- {src}: {cnt}")

    lines.extend(["", "## Count by family (family_display)", ""])
    for fam, cnt in sorted(by_family.items()):
        lines.append(f"- {fam}: {cnt}")

    lines.extend(["", "## Count by family_hsl (HSL heuristic)", ""])
    for fam, cnt in sorted(by_family_hsl.items()):
        lines.append(f"- {fam}: {cnt}")

    lines.extend(["", "## Display name cleanup", ""])
    lines.append(f"- Weird / cleaned display names: **{weird_names}**")
    lines.append(f"- Rows where raw_name != display_name: **{sum(1 for c in colors if c.metadata.get('raw_name', c.name) != c.name)}**")

    lines.extend(["", "## Skipped rows by source", ""])
    for sr in build_report.source_reports:
        if sr.skipped:
            lines.append(f"- {sr.source}: {sr.skipped} skipped")
            for reason, count in sorted(sr.skip_reasons.items()):
                lines.append(f"  - {reason}: {count}")
        else:
            lines.append(f"- {sr.source}: 0 skipped")

    lines.extend(
        [
            "",
            "## Descriptor length stats (after dedupe)",
            "",
            f"- min: {desc_stats['min']:.1f}",
            f"- max: {desc_stats['max']:.1f}",
            f"- mean: {desc_stats['mean']:.1f}",
            "",
            "## Sample rows by source",
            "",
        ]
    )

    samples_by_source: dict[str, list[CandidateColor]] = defaultdict(list)
    for color in colors:
        if len(samples_by_source[color.source]) < 5:
            samples_by_source[color.source].append(color)

    for src in sorted(samples_by_source.keys()):
        lines.append(f"### {src}")
        lines.append("")
        lines.append("| name | hex | family | descriptor |")
        lines.append("| --- | --- | --- | --- |")
        for row in samples_by_source[src]:
            desc = row.descriptor.replace("|", "\\|")
            if len(desc) > 80:
                desc = desc[:77] + "..."
            lines.append(f"| {row.name} | {row.hex} | {row.family} | {desc} |")
        lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info("Wrote parquet: %s", parquet_path)
    logger.info("Wrote jsonl: %s", jsonl_path)
    logger.info("Wrote report: %s", report_path)


def build_candidate_bank(cfg: DictConfig) -> list[CandidateColor]:
    """Core pipeline: load, dedupe, write artifacts."""
    seed = int(cfg.project.get("seed", 42))
    set_seed(seed)

    raw_colors, build_report = load_all_sources(cfg)

    dedupe_enabled = bool(cfg.data.candidate_bank.get("dedupe", True))
    build_report.dedupe_enabled = dedupe_enabled
    colors = dedupe_colors(raw_colors) if dedupe_enabled else list(raw_colors)
    build_report.after_dedupe = len(colors)
    build_report.duplicate_count = build_report.raw_total - build_report.after_dedupe

    parquet_path = get_path(cfg, "candidate_bank_parquet")
    jsonl_path = get_path(cfg, "candidate_bank_jsonl")
    report_path = get_path(cfg, "candidate_schema_report")

    write_outputs(
        colors,
        parquet_path=parquet_path,
        jsonl_path=jsonl_path,
        report_path=report_path,
        build_report=build_report,
    )
    return colors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build candidate color bank from configured data sources."
    )
    parser.add_argument(
        "--config",
        type=str,
        default="configs/local_debug.yaml",
        help="Path to YAML config (relative to project root)",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg_path = resolve_path(args.config)
    cfg = load_config(cfg_path)
    logger.info("Using config: %s", cfg_path)
    logger.info("Project root: %s", get_project_root())
    build_candidate_bank(cfg)


if __name__ == "__main__":
    main()
