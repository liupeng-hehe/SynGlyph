"""Build anchor-positive training pairs from candidate bank and optional sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
from omegaconf import DictConfig, OmegaConf

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.data.load_nrc_word_colour import load_nrc_from_config
from colorrec.data.load_user_curated import load_user_curated_from_config, normalize_anchor
from colorrec.data.split_dataset import SplitReport, assign_splits, partition_by_split
from colorrec.descriptors import (
    FAMILY_ASSOCIATIONS,
    _dedupe_preserve,
    _extract_metadata_terms,
    _lightness_phrases,
    _saturation_phrases,
    _warmth_phrases,
)
from colorrec.logging_utils import set_seed, setup_logging
from colorrec.schemas import CandidateColor, TrainingPair

logger = logging.getLogger(__name__)

_PHRASE_SPLIT_RE = re.compile(r"[,;|/]+")


@dataclass
class BuildPairsReport:
    skipped: dict[str, int] = field(default_factory=dict)
    duplicates_removed: int = 0
    filtered_generic_anchors: list[str] = field(default_factory=list)
    cleaned_suspicious_examples: list[str] = field(default_factory=list)
    by_source: dict[str, int] = field(default_factory=dict)


def load_candidate_bank(parquet_path: str | Path) -> list[CandidateColor]:
    """Load candidate colors from parquet."""
    path = Path(parquet_path)
    if not path.exists():
        raise FileNotFoundError(f"Candidate bank not found: {path}")
    df = pd.read_parquet(path)
    colors: list[CandidateColor] = []
    for record in df.to_dict(orient="records"):
        meta = record.get("metadata")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except json.JSONDecodeError:
                meta = {}
        if not isinstance(meta, dict):
            meta = {}
        record = dict(record)
        record["metadata"] = meta
        colors.append(CandidateColor.model_validate(record))
    logger.info("Loaded %d candidate colors from %s", len(colors), path)
    return colors


def truncate_descriptor(descriptor: str, max_chars: int) -> str:
    """Truncate a comma-separated descriptor without breaking mid-phrase."""
    if max_chars <= 0:
        return ""
    if len(descriptor) <= max_chars:
        return descriptor
    parts = [p.strip() for p in descriptor.split(", ") if p.strip()]
    kept: list[str] = []
    length = 0
    for part in parts:
        sep = ", " if kept else ""
        addition = f"{sep}{part}"
        if length + len(addition) > max_chars:
            break
        kept.append(part)
        length += len(addition)
    if kept:
        return ", ".join(kept)
    return parts[0][:max_chars] if parts else descriptor[:max_chars]


def _contains_suspicious(text: str, suspicious_tokens: set[str]) -> bool:
    lower = text.lower()
    return any(tok in lower for tok in suspicious_tokens)


def make_training_positive_descriptor(
    color: CandidateColor,
    *,
    max_chars: int = 220,
    max_metadata_terms: int = 8,
    suspicious_tokens: Iterable[str] | None = None,
    report: BuildPairsReport | None = None,
) -> str:
    """Build a shorter training positive descriptor for a candidate color."""
    suspicious = {str(t).strip().lower() for t in (suspicious_tokens or []) if str(t).strip()}

    parts: list[str] = [
        color.name.strip().lower(),
        f"{color.family} family",
    ]
    parts.extend(_lightness_phrases(color.l))
    parts.extend(_saturation_phrases(color.s))
    parts.extend(_warmth_phrases(color.family))
    parts.extend(FAMILY_ASSOCIATIONS.get(color.family, []))

    meta_terms = _extract_metadata_terms(color.metadata)[:max_metadata_terms]
    parts.extend(meta_terms)

    cleaned: list[str] = []
    for phrase in _dedupe_preserve(parts):
        if _contains_suspicious(phrase, suspicious):
            if report is not None and len(report.cleaned_suspicious_examples) < 20:
                report.cleaned_suspicious_examples.append(phrase)
            continue
        cleaned.append(phrase)

    descriptor = ", ".join(cleaned)
    return truncate_descriptor(descriptor, max_chars)


def make_pair_id(source: str, anchor: str, positive_key: str, positive: str) -> str:
    """Stable pair id from normalized anchor, positive key, and positive text."""
    norm_a = normalize_anchor(anchor)
    norm_p = " ".join(positive.strip().lower().split())
    digest = hashlib.sha1(f"{norm_a}|{positive_key}|{norm_p}".encode("utf-8")).hexdigest()[:12]
    return f"{source}:{digest}"


def _self_source_name(color_source: str) -> str:
    return f"{color_source}_self"


def _self_weight(color_source: str, weights: dict[str, Any]) -> float:
    key = _self_source_name(color_source)
    return float(weights.get(key, weights.get("candidate_self", 1.0)))


def build_candidate_self_pairs(
    colors: list[CandidateColor],
    cfg: DictConfig,
    *,
    report: BuildPairsReport | None = None,
) -> list[TrainingPair]:
    """Build one self-supervised pair per candidate color."""
    tp_cfg = cfg.data.get("training_pairs", {})
    weights = tp_cfg.get("weights", {})
    max_positive_chars = int(tp_cfg.get("max_positive_chars", 220))
    max_metadata_terms = int(tp_cfg.get("max_metadata_terms", 8))
    suspicious_tokens = list(tp_cfg.get("suspicious_tokens_to_clean", []))

    pairs: list[TrainingPair] = []
    for color in colors:
        positive = make_training_positive_descriptor(
            color,
            max_chars=max_positive_chars,
            max_metadata_terms=max_metadata_terms,
            suspicious_tokens=suspicious_tokens,
            report=report,
        )
        source = _self_source_name(color.source)
        pair = TrainingPair(
            pair_id=make_pair_id(source, color.name, color.color_id, positive),
            anchor=normalize_anchor(color.name),
            positive=positive,
            positive_color_id=color.color_id,
            positive_hex=color.hex,
            source=source,
            weight=_self_weight(color.source, weights),
            metadata={"color_family": color.family},
        )
        pairs.append(pair)

    logger.info("Built %d candidate_self pairs", len(pairs))
    return pairs


def _split_anchor_phrases(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        chunks = _PHRASE_SPLIT_RE.split(raw)
        return [" ".join(chunk.strip().lower().split()) for chunk in chunks if chunk.strip()]
    if isinstance(raw, (list, tuple, set)):
        out: list[str] = []
        for item in raw:
            out.extend(_split_anchor_phrases(item))
        return out
    text = str(raw).strip()
    if not text:
        return []
    return [" ".join(text.lower().split())]


def _is_valid_metadata_anchor(
    anchor: str,
    *,
    generic_terms: set[str],
    suspicious_tokens: set[str],
    min_chars: int,
    max_chars: int,
    report: BuildPairsReport | None = None,
) -> bool:
    norm = normalize_anchor(anchor)
    if len(norm) < min_chars or len(norm) > max_chars:
        return False
    if _contains_suspicious(norm, suspicious_tokens):
        return False

    tokens = norm.split()
    if len(tokens) == 1:
        if tokens[0] in generic_terms:
            if report is not None and len(report.filtered_generic_anchors) < 50:
                report.filtered_generic_anchors.append(norm)
            return False
        if len(tokens[0]) < 4:
            return False
        return True

    if len(tokens) > 5:
        return False

    non_generic = [t for t in tokens if t not in generic_terms]
    if not non_generic:
        if report is not None and len(report.filtered_generic_anchors) < 50:
            report.filtered_generic_anchors.append(norm)
        return False

    return True


def build_color_pedia_metadata_pairs(
    colors: list[CandidateColor],
    cfg: DictConfig,
    *,
    report: BuildPairsReport | None = None,
) -> list[TrainingPair]:
    """Build metadata-phrase anchor pairs for Color-Pedia rows only."""
    tp_cfg = cfg.data.get("training_pairs", {})
    weights = tp_cfg.get("weights", {})
    weight = float(weights.get("color_pedia_metadata", 1.0))
    max_pairs = int(tp_cfg.get("max_metadata_pairs_per_color", 6))
    max_positive_chars = int(tp_cfg.get("max_positive_chars", 220))
    max_metadata_terms = int(tp_cfg.get("max_metadata_terms", 8))
    min_anchor_chars = int(tp_cfg.get("min_anchor_chars", 2))
    max_anchor_chars = int(tp_cfg.get("max_anchor_chars", 128))
    metadata_fields = list(tp_cfg.get("metadata_anchor_fields", []))
    generic_terms = {str(t).strip().lower() for t in tp_cfg.get("generic_anchor_terms", [])}
    suspicious_tokens = {str(t).strip().lower() for t in tp_cfg.get("suspicious_tokens_to_clean", [])}

    pairs: list[TrainingPair] = []
    skipped_generic = 0
    skipped_invalid = 0

    for color in colors:
        if color.source != "color_pedia":
            continue

        positive = make_training_positive_descriptor(
            color,
            max_chars=max_positive_chars,
            max_metadata_terms=max_metadata_terms,
            suspicious_tokens=suspicious_tokens,
            report=report,
        )

        candidates: list[str] = []
        seen_anchors: set[str] = set()
        for field_name in metadata_fields:
            if field_name not in color.metadata:
                continue
            for phrase in _split_anchor_phrases(color.metadata[field_name]):
                norm = normalize_anchor(phrase)
                if norm in seen_anchors:
                    continue
                seen_anchors.add(norm)
                if not _is_valid_metadata_anchor(
                    norm,
                    generic_terms=generic_terms,
                    suspicious_tokens=suspicious_tokens,
                    min_chars=min_anchor_chars,
                    max_chars=max_anchor_chars,
                    report=report,
                ):
                    tokens = norm.split()
                    if len(tokens) == 1 and tokens[0] in generic_terms:
                        skipped_generic += 1
                    else:
                        skipped_invalid += 1
                    continue
                candidates.append(norm)

        for anchor in candidates[:max_pairs]:
            pairs.append(
                TrainingPair(
                    pair_id=make_pair_id("color_pedia_metadata", anchor, color.color_id, positive),
                    anchor=anchor,
                    positive=positive,
                    positive_color_id=color.color_id,
                    positive_hex=color.hex,
                    source="color_pedia_metadata",
                    weight=weight,
                    metadata={"color_family": color.family, "color_name": color.name},
                )
            )

    if report is not None:
        if skipped_generic:
            report.skipped["generic_anchor"] = report.skipped.get("generic_anchor", 0) + skipped_generic
        if skipped_invalid:
            report.skipped["invalid_metadata_anchor"] = (
                report.skipped.get("invalid_metadata_anchor", 0) + skipped_invalid
            )

    logger.info("Built %d color_pedia_metadata pairs", len(pairs))
    return pairs


def build_all_pairs(
    colors: list[CandidateColor],
    cfg: DictConfig,
) -> tuple[list[TrainingPair], BuildPairsReport]:
    """Assemble training pairs from all enabled sources."""
    report = BuildPairsReport()
    tp_cfg = cfg.data.get("training_pairs", {})
    enabled = tp_cfg.get("enabled_sources", {})

    pairs: list[TrainingPair] = []

    if enabled.get("candidate_self", True):
        self_pairs = build_candidate_self_pairs(colors, cfg, report=report)
        pairs.extend(self_pairs)
        report.by_source.update(Counter(p.source for p in self_pairs))

    if enabled.get("color_pedia_metadata", True):
        meta_pairs = build_color_pedia_metadata_pairs(colors, cfg, report=report)
        pairs.extend(meta_pairs)
        for src, cnt in Counter(p.source for p in meta_pairs).items():
            report.by_source[src] = report.by_source.get(src, 0) + cnt

    if enabled.get("user_curated", True):
        user_pairs = load_user_curated_from_config(cfg, colors)
        pairs.extend(user_pairs)
        for src, cnt in Counter(p.source for p in user_pairs).items():
            report.by_source[src] = report.by_source.get(src, 0) + cnt

    if enabled.get("nrc_word_colour", False):
        nrc_pairs = load_nrc_from_config(cfg)
        pairs.extend(nrc_pairs)
        for src, cnt in Counter(p.source for p in nrc_pairs).items():
            report.by_source[src] = report.by_source.get(src, 0) + cnt

    if enabled.get("colors_in_context", False):
        logger.warning("colors_in_context is not implemented yet; skipping")

    return pairs, report


def dedupe_pairs(pairs: list[TrainingPair]) -> tuple[list[TrainingPair], int]:
    """Deduplicate by pair_id, keeping the higher-weight (richer metadata) pair."""
    best: dict[str, TrainingPair] = {}
    for pair in pairs:
        existing = best.get(pair.pair_id)
        if existing is None:
            best[pair.pair_id] = pair
            continue
        if pair.weight > existing.weight:
            best[pair.pair_id] = pair
            continue
        if pair.weight == existing.weight and len(json.dumps(pair.metadata, sort_keys=True)) > len(
            json.dumps(existing.metadata, sort_keys=True)
        ):
            best[pair.pair_id] = pair
    removed = len(pairs) - len(best)
    return list(best.values()), removed


def _percentile(values: list[int], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = int(round((pct / 100.0) * (len(ordered) - 1)))
    return float(ordered[idx])


def _length_stats(values: list[int]) -> dict[str, float]:
    if not values:
        return {"avg": 0.0, "p50": 0.0, "p90": 0.0}
    return {
        "avg": float(sum(values) / len(values)),
        "p50": _percentile(values, 50),
        "p90": _percentile(values, 90),
    }


def write_jsonl(pairs: list[TrainingPair], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for pair in pairs:
            fh.write(pair.model_dump_json() + "\n")
    logger.info("Wrote %d pairs to %s", len(pairs), path)


def write_stats_md(
    pairs: list[TrainingPair],
    *,
    path: Path,
    build_report: BuildPairsReport,
    split_report: SplitReport,
    colors: list[CandidateColor] | None = None,
) -> None:
    """Write markdown statistics report for training pairs."""
    path.parent.mkdir(parents=True, exist_ok=True)

    by_source = Counter(p.source for p in pairs)
    by_split = Counter(p.split for p in pairs if p.split)
    unique_anchors = {normalize_anchor(p.anchor) for p in pairs}
    unique_color_ids = {p.positive_color_id for p in pairs if p.positive_color_id}

    anchor_lengths = [len(p.anchor) for p in pairs]
    positive_lengths = [len(p.positive) for p in pairs]
    anchor_stats = _length_stats(anchor_lengths)
    positive_stats = _length_stats(positive_lengths)

    family_counter: Counter[str] = Counter()
    for pair in pairs:
        fam = pair.metadata.get("color_family")
        if isinstance(fam, str) and fam:
            family_counter[fam] += 1

    anchor_counter = Counter(normalize_anchor(p.anchor) for p in pairs)
    token_counter: Counter[str] = Counter()
    for anchor in unique_anchors:
        token_counter.update(anchor.split())

    lines = [
        "# Training Pair Statistics",
        "",
        f"- Total pairs: **{len(pairs)}**",
        f"- Duplicates removed: **{build_report.duplicates_removed}**",
        "",
        "## Pairs by source",
        "",
    ]
    for src, cnt in sorted(by_source.items()):
        lines.append(f"- {src}: {cnt}")

    user_curated_pairs = [p for p in pairs if p.source == "user_curated"]
    if user_curated_pairs:
        curated_anchors = Counter(normalize_anchor(p.anchor) for p in user_curated_pairs)
        lines.extend(["", "## User curated anchors", ""])
        lines.append(f"- user_curated pairs: **{len(user_curated_pairs)}**")
        lines.append(f"- unique curated anchors: **{len(curated_anchors)}**")
        for anchor, cnt in curated_anchors.most_common(15):
            lines.append(f"- `{anchor}`: {cnt}")

    if colors:
        from colorrec.colorspace import is_weird_display_name

        by_source_bank = Counter(c.source for c in colors)
        by_family_display = Counter(c.family for c in colors)
        weird = sum(
            1
            for c in colors
            if is_weird_display_name(str(c.metadata.get("raw_name", c.name)))
            or c.metadata.get("raw_name", c.name) != c.name
        )
        lines.extend(["", "## Candidate bank snapshot", ""])
        if "user_curated_palette" in by_source_bank:
            lines.append(f"- user_curated_palette colors: **{by_source_bank['user_curated_palette']}**")
        lines.append(f"- weird / cleaned display names: **{weird}**")
        lines.extend(["", "### family_display (top 10)", ""])
        for fam, cnt in by_family_display.most_common(10):
            lines.append(f"- {fam}: {cnt}")

    lines.extend(["", "## Pairs by split", ""])
    for split_name in ("train", "val", "test"):
        lines.append(f"- {split_name}: {by_split.get(split_name, 0)}")
    if split_report.note:
        lines.append(f"- Note: {split_report.note}")

    lines.extend(
        [
            "",
            "## Uniques",
            "",
            f"- Unique anchors: {len(unique_anchors)}",
            f"- Unique positive_color_id: {len(unique_color_ids)}",
            "",
            "## Anchor length stats",
            "",
            f"- average: {anchor_stats['avg']:.1f}",
            f"- p50: {anchor_stats['p50']:.1f}",
            f"- p90: {anchor_stats['p90']:.1f}",
            "",
            "## Positive length stats",
            "",
            f"- average: {positive_stats['avg']:.1f}",
            f"- p50: {positive_stats['p50']:.1f}",
            f"- p90: {positive_stats['p90']:.1f}",
            "",
        ]
    )

    if family_counter:
        lines.extend(["## Family distribution", ""])
        for fam, cnt in sorted(family_counter.items()):
            lines.append(f"- {fam}: {cnt}")
        lines.append("")

    lines.extend(["## Skipped counts by reason", ""])
    if build_report.skipped:
        for reason, cnt in sorted(build_report.skipped.items()):
            lines.append(f"- {reason}: {cnt}")
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            "## Leakage check",
            "",
            f"- Passed: **{split_report.leakage.passed}**",
            f"- Anchor cross-split violations: {split_report.leakage.anchor_cross_split_violations}",
            f"- Color-id cross-split violations: {split_report.leakage.color_id_cross_split_violations}",
        ]
    )
    if split_report.leakage.examples_anchor:
        lines.append("")
        lines.append("### Anchor leakage examples")
        for ex in split_report.leakage.examples_anchor:
            lines.append(f"- `{ex['anchor']}` -> {ex['splits']}")
    if split_report.leakage.examples_color_id:
        lines.append("")
        lines.append("### Color-id leakage examples")
        for ex in split_report.leakage.examples_color_id:
            lines.append(f"- `{ex['positive_color_id']}` -> {ex['splits']}")

    lines.extend(["", "## Top 50 anchors", ""])
    for anchor, cnt in anchor_counter.most_common(50):
        lines.append(f"- {anchor}: {cnt}")

    lines.extend(["", "## Top 100 anchor tokens", ""])
    for token, cnt in token_counter.most_common(100):
        lines.append(f"- {token}: {cnt}")

    lines.extend(["", "## Random 20 examples per source", ""])
    by_source_examples: dict[str, list[TrainingPair]] = defaultdict(list)
    for pair in pairs:
        by_source_examples[pair.source].append(pair)
    for src in sorted(by_source_examples.keys()):
        lines.append(f"### {src}")
        lines.append("")
        sample = by_source_examples[src][:20]
        for pair in sample:
            pos_preview = pair.positive if len(pair.positive) <= 100 else pair.positive[:97] + "..."
            lines.append(f"- anchor=`{pair.anchor}` | positive=`{pos_preview}` | weight={pair.weight}")
        lines.append("")

    lines.extend(["", "## Longest 20 positives", ""])
    longest = sorted(pairs, key=lambda p: len(p.positive), reverse=True)[:20]
    for pair in longest:
        lines.append(f"- [{pair.source}] len={len(pair.positive)} | `{pair.positive}`")

    lines.extend(["", "## Filtered generic anchor examples", ""])
    if build_report.filtered_generic_anchors:
        for anchor in build_report.filtered_generic_anchors[:20]:
            lines.append(f"- {anchor}")
    else:
        lines.append("- none")

    lines.extend(["", "## Cleaned suspicious token examples", ""])
    if build_report.cleaned_suspicious_examples:
        for phrase in build_report.cleaned_suspicious_examples[:20]:
            lines.append(f"- {phrase}")
    else:
        lines.append("- none")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info("Wrote stats report: %s", path)


def build_training_pairs(cfg: DictConfig) -> tuple[list[TrainingPair], BuildPairsReport, SplitReport]:
    """Core pipeline: load bank, build pairs, dedupe, split, write artifacts."""
    seed = int(cfg.data.get("training_pairs", {}).get("split", {}).get("seed", cfg.project.get("seed", 42)))
    set_seed(seed)

    parquet_path = get_path(cfg, "candidate_bank_parquet")
    colors = load_candidate_bank(parquet_path)

    pairs, build_report = build_all_pairs(colors, cfg)
    pairs, removed = dedupe_pairs(pairs)
    build_report.duplicates_removed = removed

    split_cfg = cfg.data.get("training_pairs", {}).get("split", {})
    pairs, split_report = assign_splits(pairs, split_cfg)

    train_pairs, val_pairs, test_pairs = partition_by_split(pairs)

    train_path = get_path(cfg, "train_pairs")
    val_path = get_path(cfg, "val_pairs")
    test_path = get_path(cfg, "test_pairs")
    stats_path = get_path(cfg, "train_pair_stats")

    write_jsonl(train_pairs, train_path)
    write_jsonl(val_pairs, val_path)
    write_jsonl(test_pairs, test_path)
    write_stats_md(pairs, path=stats_path, build_report=build_report, split_report=split_report, colors=colors)

    build_report.by_source = dict(Counter(p.source for p in pairs))
    return pairs, build_report, split_report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build anchor-positive training pairs from candidate bank."
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
    pairs, report, split_report = build_training_pairs(cfg)
    logger.info(
        "Built %d training pairs (train=%d val=%d test=%d); leakage passed=%s",
        len(pairs),
        sum(1 for p in pairs if p.split == "train"),
        sum(1 for p in pairs if p.split == "val"),
        sum(1 for p in pairs if p.split == "test"),
        split_report.leakage.passed,
    )


if __name__ == "__main__":
    main()
