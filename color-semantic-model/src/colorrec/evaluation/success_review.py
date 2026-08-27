"""Generate a human-readable success review folder after baseline/fine-tuned eval."""

from __future__ import annotations

import argparse
import json
import logging
import platform
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from omegaconf import DictConfig, OmegaConf

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.colorspace import clean_display_name, infer_semantic_family
from colorrec.evaluation.compare_runs import (
    METRIC_KEYS,
    build_all_metrics_tables,
    lookup_metric_delta,
    metric_delta_from_reports,
)
from colorrec.evaluation.evaluate_retrieval import METRIC_MODES, get_split_metrics
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)

METRIC_SPLITS = ["val", "test", "metadata_val", "metadata_test"]

VERDICT_IMPROVED = "improved"
VERDICT_UNCHANGED_GOOD = "unchanged_good"
VERDICT_UNCHANGED_BAD = "unchanged_bad"
VERDICT_REGRESSED = "regressed"
VERDICT_NEEDS_REVIEW = "needs_human_review"

DECISION_GREEN = "GREEN"
DECISION_YELLOW = "YELLOW"
DECISION_RED = "RED"

QUALITATIVE_TOP_N = 5

FAMILY_NAME_HINTS: dict[str, tuple[str, ...]] = {
    "red": ("red", "crimson", "scarlet", "maroon", "wine", "burgundy"),
    "pink": ("pink", "rose", "fuchsia", "magenta", "blush", "hot pink", "coral"),
    "orange": ("orange", "coral", "tangerine", "terracotta", "burnt orange", "sienna"),
    "yellow": ("yellow", "gold", "honey", "mustard", "champagne", "sunny"),
    "green": ("green", "sage", "olive", "mint", "forest", "moss"),
    "blue": ("blue", "cyan", "navy", "teal", "sapphire"),
    "purple": ("purple", "violet", "lavender", "plum", "periwinkle"),
    "brown": ("brown", "coffee", "cocoa", "chocolate", "earth", "sepia", "sienna", "terracotta"),
    "white": ("white", "ivory", "cream", "linen", "champagne"),
    "black": ("black", "charcoal", "ink", "midnight"),
    "grey": ("grey", "gray", "silver"),
}


@dataclass
class ArtifactEntry:
    key: str
    path: Path
    description: str
    category: str = "general"
    exists: bool = False
    size_bytes: int = 0
    modified_at: str | None = None


@dataclass
class ReviewContext:
    cfg: DictConfig
    run_id: str
    output_dir: Path
    config_path: Path
    artifacts: list[ArtifactEntry] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    baseline_retrieval: dict[str, Any] = field(default_factory=dict)
    finetuned_retrieval: dict[str, Any] = field(default_factory=dict)
    baseline_qualitative: dict[str, Any] = field(default_factory=dict)
    finetuned_qualitative: dict[str, Any] = field(default_factory=dict)
    train_summary: dict[str, Any] = field(default_factory=dict)
    inspection: dict[str, Any] = field(default_factory=dict)
    stats_md: str = ""
    qualitative_verdicts: list[dict[str, Any]] = field(default_factory=list)
    metrics_rows: list[dict[str, Any]] = field(default_factory=list)
    decision: str = DECISION_RED
    decision_reasons: list[str] = field(default_factory=list)
    next_actions: list[str] = field(default_factory=list)
    pytest_passed: bool | None = None


def _safe_load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse JSON %s: %s", path, exc)
        return {}


def _safe_read_text(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to read %s: %s", path, exc)
        return ""


def _stat_entry(path: Path) -> tuple[bool, int, str | None]:
    if not path.exists():
        return False, 0, None
    stat = path.stat()
    modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
    if path.is_dir():
        return True, 0, modified
    return True, stat.st_size, modified


def _path_from_cfg(cfg: DictConfig, key: str | None, fallback: str | None = None) -> Path | None:
    if key:
        try:
            return get_path(cfg, key)
        except KeyError:
            pass
    if fallback:
        return resolve_path(fallback)
    return None


def build_artifact_manifest(cfg: DictConfig) -> list[ArtifactEntry]:
    """Collect artifact paths from config with descriptions."""
    entries: list[tuple[str, str | None, str, str, str | None]] = [
        ("candidate_schema_report", "candidate_schema_report", "Candidate bank schema report", "data", None),
        ("candidate_bank_inspection_json", "candidate_bank_inspection_json", "Candidate bank inspection JSON", "data", None),
        ("candidate_bank_inspection_md", "candidate_bank_inspection_md", "Candidate bank inspection markdown", "data", None),
        ("candidate_bank_parquet", "candidate_bank_parquet", "Candidate color bank parquet, one row per color", "data", None),
        ("candidate_embeddings", "candidate_embeddings", "Precomputed normalized baseline descriptor embeddings", "data", None),
        ("fine_tuned_candidate_embeddings", "fine_tuned_candidate_embeddings", "Fine-tuned model candidate embeddings", "data", None),
        ("train_pair_stats", "train_pair_stats", "Training pair build statistics and leakage check", "data", None),
        ("train_pairs", "train_pairs", "Anchor-positive pairs used for fine-tuning", "data", None),
        ("val_pairs", "val_pairs", "Validation query pairs", "data", None),
        ("test_pairs", "test_pairs", "Test query pairs", "data", None),
        ("metadata_val_pairs", "metadata_val_pairs", "Metadata diagnostic validation holdout", "data", None),
        ("metadata_test_pairs", "metadata_test_pairs", "Metadata diagnostic test holdout", "data", None),
        ("train_summary_json", "train_summary_json", "Fine-tuning run summary JSON", "training", None),
        ("train_summary_md", "train_summary_md", "Fine-tuning run summary markdown", "training", None),
        ("baseline_retrieval_json", "baseline_retrieval_json", "Base model retrieval metrics", "evaluation", None),
        ("baseline_retrieval_md", "baseline_retrieval_md", "Base model retrieval report", "evaluation", None),
        ("baseline_qualitative_json", "baseline_qualitative_json", "Base model qualitative top-k JSON", "evaluation", None),
        ("baseline_qualitative_md", "baseline_qualitative_md", "Base model qualitative report", "evaluation", None),
        ("fine_tuned_retrieval_json", "fine_tuned_retrieval_json", "Fine-tuned retrieval metrics", "evaluation", None),
        ("fine_tuned_retrieval_md", "fine_tuned_retrieval_md", "Fine-tuned retrieval report", "evaluation", None),
        ("fine_tuned_qualitative_json", "fine_tuned_qualitative_json", "Fine-tuned qualitative top-k JSON", "evaluation", None),
        ("fine_tuned_qualitative_md", "fine_tuned_qualitative_md", "Fine-tuned qualitative report", "evaluation", None),
        ("compare_report_md", "compare_report_md", "Baseline vs fine-tuned comparison", "evaluation", None),
        ("final_model_dir", None, "Fine-tuned sentence-transformer final checkpoint", "model", None),
        ("full_model_dir", None, "Full local training final checkpoint (optional)", "model", "models/full_color_sentence_transformer/final"),
    ]

    manifest: list[ArtifactEntry] = []
    for key, cfg_key, desc, category, fallback in entries:
        if key == "final_model_dir":
            raw = str(cfg.train.get("final_model_dir", "models/color_sentence_transformer/final"))
            path = resolve_path(raw)
        elif cfg_key:
            path = _path_from_cfg(cfg, cfg_key)
        else:
            path = resolve_path(fallback) if fallback else None
        if path is None:
            continue
        exists, size, modified = _stat_entry(path)
        manifest.append(
            ArtifactEntry(
                key=key,
                path=path,
                description=desc,
                category=category,
                exists=exists,
                size_bytes=size,
                modified_at=modified,
            )
        )
    return manifest


def load_review_context(
    cfg: DictConfig,
    *,
    run_id: str,
    output_dir: Path,
    config_path: Path,
    pytest_passed: bool | None = None,
) -> ReviewContext:
    ctx = ReviewContext(
        cfg=cfg,
        run_id=run_id,
        output_dir=output_dir,
        config_path=config_path,
        pytest_passed=pytest_passed,
    )
    ctx.artifacts = build_artifact_manifest(cfg)

    for entry in ctx.artifacts:
        if not entry.exists:
            ctx.warnings.append(f"Missing artifact: {entry.path}")

    baseline_path = _path_from_cfg(cfg, "baseline_retrieval_json")
    finetuned_path = _path_from_cfg(cfg, "fine_tuned_retrieval_json")
    if baseline_path:
        ctx.baseline_retrieval = _safe_load_json(baseline_path)
    if finetuned_path:
        ctx.finetuned_retrieval = _safe_load_json(finetuned_path)

    base_qual_path = _path_from_cfg(cfg, "baseline_qualitative_json")
    fine_qual_path = _path_from_cfg(cfg, "fine_tuned_qualitative_json")
    if base_qual_path:
        ctx.baseline_qualitative = _safe_load_json(base_qual_path)
    if fine_qual_path:
        ctx.finetuned_qualitative = _safe_load_json(fine_qual_path)

    train_summary_path = _path_from_cfg(cfg, "train_summary_json")
    if train_summary_path:
        ctx.train_summary = _safe_load_json(train_summary_path)

    inspection_path = _path_from_cfg(cfg, "candidate_bank_inspection_json")
    if inspection_path:
        ctx.inspection = _safe_load_json(inspection_path)

    stats_path = _path_from_cfg(cfg, "train_pair_stats")
    if stats_path:
        ctx.stats_md = _safe_read_text(stats_path)

    ctx.metrics_rows = build_all_metrics_tables(
        ctx.baseline_retrieval,
        ctx.finetuned_retrieval,
        METRIC_SPLITS,
    )
    ctx.qualitative_verdicts = build_qualitative_verdicts(cfg, ctx.baseline_qualitative, ctx.finetuned_qualitative)
    return ctx


def get_expected_families(cfg: DictConfig) -> dict[str, list[str]]:
    sr = cfg.evaluation.get("success_review", {})
    raw = sr.get("expected_prompt_families", {})
    return {str(k): [str(f).lower() for f in v] for k, v in OmegaConf.to_container(raw, resolve=True).items()}


def get_thresholds(cfg: DictConfig) -> dict[str, Any]:
    sr = cfg.evaluation.get("success_review", {})
    defaults = default_success_criteria()["metrics"]
    qual_defaults = default_success_criteria()["qualitative"]
    eng_defaults = default_success_criteria()["engineering"]
    data_defaults = default_success_criteria()["data"]
    thresholds = sr.get("thresholds", {})
    merged = {
        **defaults,
        **qual_defaults,
        "max_leakage_violations": data_defaults["max_leakage_violations"],
        "require_model_exists": eng_defaults["require_model_exists"],
        "require_embeddings_exist": eng_defaults["require_embeddings_exist"],
    }
    merged.update(OmegaConf.to_container(thresholds, resolve=True))
    return merged


def _hit_display_name(hit: dict[str, Any]) -> str:
    display = hit.get("display_name")
    if display:
        return str(display)
    return str(hit.get("name", ""))


def _hit_hsl(hit: dict[str, Any]) -> tuple[float, float, float]:
    hsl = hit.get("hsl")
    if isinstance(hsl, (list, tuple)) and len(hsl) >= 3:
        return float(hsl[0]), float(hsl[1]), float(hsl[2])
    return float(hit.get("h", 0)), float(hit.get("s", 0)), float(hit.get("l", 0.5))


def _hit_effective_families(hit: dict[str, Any]) -> set[str]:
    families: set[str] = set()
    for key in ("family_display", "family"):
        val = hit.get(key)
        if val:
            families.add(str(val).lower())
    family_hsl = hit.get("family_hsl")
    if family_hsl:
        families.add(str(family_hsl).lower())

    name = clean_display_name(_hit_display_name(hit), hit.get("hex"))
    h, s, l = _hit_hsl(hit)
    hsl_fallback = str(hit.get("family_hsl") or hit.get("family") or "grey").lower()
    families.add(infer_semantic_family(name, h, s, l, hsl_fallback))
    return {f for f in families if f}


def _name_implies_expected_family(name: str, expected: list[str]) -> bool:
    cleaned = clean_display_name(name).lower()
    for fam in expected:
        hints = FAMILY_NAME_HINTS.get(fam, (fam,))
        if any(hint in cleaned for hint in hints):
            return True
    return False


def _hit_matches_expected(hit: dict[str, Any], expected: list[str]) -> bool:
    effective = _hit_effective_families(hit)
    if effective & set(expected):
        return True
    return _name_implies_expected_family(_hit_display_name(hit), expected)


def _family_match_score(
    hits: list[dict[str, Any]],
    expected: list[str],
    top_n: int = QUALITATIVE_TOP_N,
) -> int:
    return sum(1 for hit in hits[:top_n] if _hit_matches_expected(hit, expected))


def _off_topic_families(
    hits: list[dict[str, Any]],
    expected: list[str],
    top_n: int = QUALITATIVE_TOP_N,
) -> list[str]:
    off: list[str] = []
    for hit in hits[:top_n]:
        if not _hit_matches_expected(hit, expected):
            primary = str(hit.get("family_display") or hit.get("family") or "unknown").lower()
            off.append(primary)
    return off


def _explain_verdict(
    *,
    base_score: int,
    fine_score: int,
    verdict: str,
    expected: list[str],
    finetuned_hits: list[dict[str, Any]],
) -> str:
    if verdict == VERDICT_IMPROVED:
        return (
            f"Semantic family matches in top-{QUALITATIVE_TOP_N} improved "
            f"from {base_score} to {fine_score} (expected: {', '.join(expected)})."
        )
    if verdict == VERDICT_REGRESSED:
        off = _off_topic_families(finetuned_hits, expected)
        off_text = ", ".join(off[:3]) if off else "none"
        return (
            f"Semantic family matches in top-{QUALITATIVE_TOP_N} dropped "
            f"from {base_score} to {fine_score}; off-topic families: {off_text}."
        )
    if verdict == VERDICT_UNCHANGED_GOOD:
        return (
            f"Stable good semantic family coverage in top-{QUALITATIVE_TOP_N} "
            f"({fine_score} matches for {', '.join(expected)})."
        )
    if verdict == VERDICT_UNCHANGED_BAD:
        return (
            f"Still weak semantic family coverage in top-{QUALITATIVE_TOP_N} "
            f"({fine_score} matches; expected {', '.join(expected)})."
        )
    if verdict == VERDICT_NEEDS_REVIEW:
        return (
            f"Mixed semantic family signals in top-{QUALITATIVE_TOP_N} "
            f"(baseline={base_score}, fine-tuned={fine_score}); manual review suggested."
        )
    return f"Verdict={verdict}; baseline={base_score}, fine-tuned={fine_score}."


def classify_prompt_verdict(
    prompt: str,
    baseline_hits: list[dict[str, Any]],
    finetuned_hits: list[dict[str, Any]],
    expected: list[str],
) -> str:
    base_score = _family_match_score(baseline_hits, expected)
    fine_score = _family_match_score(finetuned_hits, expected)
    base_off = _off_topic_families(baseline_hits, expected)
    fine_off = _off_topic_families(finetuned_hits, expected)

    if fine_score > base_score:
        return VERDICT_IMPROVED
    if fine_score < base_score:
        return VERDICT_REGRESSED
    if fine_score >= 3:
        return VERDICT_UNCHANGED_GOOD
    if len(fine_off) >= 3 and fine_score == 0:
        return VERDICT_NEEDS_REVIEW
    if base_score <= 1 and fine_score <= 1:
        return VERDICT_UNCHANGED_BAD
    return VERDICT_NEEDS_REVIEW


def build_qualitative_verdicts(
    cfg: DictConfig,
    baseline_qual: dict[str, Any],
    finetuned_qual: dict[str, Any],
) -> list[dict[str, Any]]:
    expected_map = get_expected_families(cfg)
    base_prompts = baseline_qual.get("prompts", {})
    fine_prompts = finetuned_qual.get("prompts", {})
    results: list[dict[str, Any]] = []
    for prompt in expected_map:
        base_hits = base_prompts.get(prompt, [])
        fine_hits = fine_prompts.get(prompt, [])
        expected = expected_map[prompt]
        verdict = classify_prompt_verdict(prompt, base_hits, fine_hits, expected)
        base_score = _family_match_score(base_hits, expected)
        fine_score = _family_match_score(fine_hits, expected)
        results.append(
            {
                "prompt": prompt,
                "expected_families": expected,
                "baseline_hits": base_hits[:5],
                "finetuned_hits": fine_hits[:5],
                "baseline_family_score": base_score,
                "finetuned_family_score": fine_score,
                "verdict": verdict,
                "heuristic_reason": _explain_verdict(
                    base_score=base_score,
                    fine_score=fine_score,
                    verdict=verdict,
                    expected=expected,
                    finetuned_hits=fine_hits,
                ),
            }
        )
    return results


def _parse_leakage_passed(stats_md: str) -> bool | None:
    if not stats_md:
        return None
    match = re.search(r"Passed:\s*\*\*(True|False)\*\*", stats_md, re.IGNORECASE)
    if match:
        return match.group(1).lower() == "true"
    return None


def _parse_stat_int(stats_md: str, label: str) -> int | None:
    match = re.search(rf"{re.escape(label)}:\s*\*\*(\d+)\*\*", stats_md)
    return int(match.group(1)) if match else None


def _is_acceptable_verdict(verdict: str) -> bool:
    return verdict in {VERDICT_IMPROVED, VERDICT_UNCHANGED_GOOD}


def decide_go_no_go(ctx: ReviewContext) -> None:
    thresholds = get_thresholds(ctx.cfg)
    reasons: list[str] = []
    actions: list[str] = []
    hard_fail = False
    soft_fail = False

    leakage_ok = _parse_leakage_passed(ctx.stats_md)
    if leakage_ok is False:
        hard_fail = True
        reasons.append("Leakage check failed (violations > 0).")
        actions.append("Fix grouped split / rebuild training pairs before scaling.")

    model_entry = next((a for a in ctx.artifacts if a.key == "final_model_dir"), None)
    if thresholds.get("require_model_exists", True) and model_entry and not model_entry.exists:
        hard_fail = True
        reasons.append("Fine-tuned final model directory is missing.")
        actions.append("Run train_sentence_transformer and verify final_model_dir.")

    critical_missing = [
        a for a in ctx.artifacts
        if a.category in {"evaluation", "training"}
        and a.key in {
            "baseline_retrieval_json",
            "fine_tuned_retrieval_json",
            "train_summary_json",
        }
        and not a.exists
    ]
    if len(critical_missing) >= 2:
        hard_fail = True
        reasons.append("Critical eval/training artifacts missing.")
        actions.append("Run baseline_retrieval and train_sentence_transformer --run_eval_after_train.")

    xkcd_splits = [r for r in ctx.metrics_rows if r["split"] in {"val", "test"} and r.get("mode") == "exact"]
    for row in xkcd_splits:
        delta_r10 = row.get("delta_recall@10", 0.0)
        max_reg = float(thresholds.get("xkcd_r10_max_regression", 0.02))
        if delta_r10 < -max_reg:
            hard_fail = True
            reasons.append(f"xkcd {row['split']} exact recall@10 regressed by {delta_r10:.3f} (>{max_reg}).")

    meta_exact_rows = [r for r in ctx.metrics_rows if r["split"].startswith("metadata_") and r.get("mode") == "exact"]
    meta_anchor_rows = [r for r in ctx.metrics_rows if r["split"].startswith("metadata_") and r.get("mode") == "anchor_group"]
    meta_family_rows = [r for r in ctx.metrics_rows if r["split"].startswith("metadata_") and r.get("mode") == "family_soft"]

    meta_exact_min = float(thresholds.get("metadata_exact_r10_min_delta", 0.02))
    meta_anchor_min = float(thresholds.get("metadata_anchor_group_r10_min_delta", 0.05))
    meta_family_min = float(thresholds.get("metadata_family_soft_r5_min_delta", 0.05))

    exact_improved = any(r.get("delta_recall@10", 0.0) >= meta_exact_min for r in meta_exact_rows)
    anchor_improved = any(r.get("delta_recall@10", 0.0) >= meta_anchor_min for r in meta_anchor_rows)
    family_improved = any(r.get("delta_recall@5", 0.0) >= meta_family_min for r in meta_family_rows)

    if meta_exact_rows and not (exact_improved or anchor_improved or family_improved):
        soft_fail = True
        reasons.append(
            "Metadata metrics did not improve on exact, anchor_group, or family_soft thresholds."
        )
        actions.append("Run full_train_local or add user_curated / cleaner metadata anchors.")
    elif meta_exact_rows and not exact_improved:
        reasons.append(
            "Metadata exact recall@10 improved modestly or via soft metrics only; review anchor_group/family_soft."
        )

    acceptable = sum(1 for q in ctx.qualitative_verdicts if _is_acceptable_verdict(q["verdict"]))
    regressed = sum(1 for q in ctx.qualitative_verdicts if q["verdict"] == VERDICT_REGRESSED)
    min_ok = int(thresholds.get("min_acceptable_prompts", 7))
    max_bad = int(thresholds.get("max_regressed_prompts", 2))

    if acceptable < min_ok:
        soft_fail = True
        reasons.append(f"Qualitative acceptable prompts {acceptable}/{len(ctx.qualitative_verdicts)} (< {min_ok}).")
    if regressed > max_bad:
        hard_fail = True
        reasons.append(f"Qualitative regressed prompts {regressed} (> {max_bad}).")

    skipped_high = any(
        int(ctx.finetuned_retrieval.get(split, {}).get("skipped_queries", 0)) > 0
        for split in METRIC_SPLITS
        if split in ctx.finetuned_retrieval
    )
    if skipped_high:
        soft_fail = True
        reasons.append("Fine-tuned eval has skipped queries; metrics may be optimistic.")
        actions.append("Review relevance rules and metadata descriptor alignment.")

    if ctx.pytest_passed is False and thresholds.get("require_pytest_passed", True):
        hard_fail = True
        reasons.append("pytest did not pass.")

    if hard_fail:
        ctx.decision = DECISION_RED
        if not actions:
            actions.extend([
                "Fix pipeline/data issues before full training.",
                "Re-run baseline + fine-tuned eval, then success_review.",
            ])
    elif soft_fail:
        ctx.decision = DECISION_YELLOW
        if not actions:
            actions.extend([
                "Run full_train_local on all train pairs (exclude holdout).",
                "Add user_curated high-weight pairs for weak prompts.",
                "Clean Color-Pedia descriptor noise and weird color names.",
            ])
    else:
        ctx.decision = DECISION_GREEN
        reasons.append("Hard checks passed: xkcd metrics stable/improved, metadata improved, qualitative acceptable.")
        actions.extend([
            "Proceed to Phase 8 HPC/Slurm full training.",
            "Keep success_review artifact for each run.",
        ])

    if not reasons:
        reasons.append("Insufficient evidence; treat as YELLOW until full eval artifacts exist.")
        ctx.decision = DECISION_YELLOW

    ctx.decision_reasons = reasons
    ctx.next_actions = list(dict.fromkeys(actions))


def default_success_criteria() -> dict[str, Any]:
    return {
        "engineering": {
            "require_pytest_passed": True,
            "require_model_exists": True,
            "require_embeddings_exist": True,
        },
        "data": {
            "max_leakage_violations": 0,
            "max_descriptor_p95_chars": 220,
            "max_suspicious_token_pct": 0.01,
        },
        "metrics": {
            "xkcd_r10_max_regression": 0.02,
            "metadata_exact_r10_min_delta": 0.02,
            "metadata_anchor_group_r10_min_delta": 0.05,
            "metadata_family_soft_r5_min_delta": 0.05,
        },
        "qualitative": {
            "min_acceptable_prompts": 7,
            "max_regressed_prompts": 2,
        },
        "decision": {
            "green_requires_all_hard_checks": True,
        },
    }


def render_readme(ctx: ReviewContext) -> str:
    return "\n".join(
        [
            f"# Success Review — {ctx.run_id}",
            "",
            "This folder summarizes whether the text-to-color sentence-transformer pipeline is working",
            "well enough to proceed to full training, HPC/Slurm, or product integration.",
            "",
            "## Most important files",
            "",
            "1. `07_go_no_go_decision.md` — final GREEN / YELLOW / RED recommendation",
            "2. `04_metrics_baseline_vs_finetuned.md` — quantitative before/after",
            "3. `05_qualitative_review.md` — fixed prompt top-k comparison",
            "4. `06_failure_cases.md` — concrete failure patterns and fixes",
            "5. `02_data_quality.md` — data readiness and leakage",
            "",
            "## Quick success checklist",
            "",
            "- Leakage check passed (train/val/test groups do not overlap)",
            "- Fine-tuned xkcd val/test recall@10 not worse than baseline",
            "- Metadata holdout improves (exact metrics are strict; do not expect high R@1)",
            "- At least 7/10 qualitative prompts look acceptable",
            "- Final model directory exists and can be reloaded",
            "",
            "## Suggested reading order",
            "",
            "1. 07_go_no_go_decision.md",
            "2. 04_metrics_baseline_vs_finetuned.md",
            "3. 05_qualitative_review.md",
            "4. 06_failure_cases.md",
            "5. 02_data_quality.md",
            "",
            f"Generated: {datetime.now(timezone.utc).isoformat()}",
            "",
        ]
    )


def render_artifact_manifest(ctx: ReviewContext) -> str:
    lines = ["# Artifact Manifest", "", "| artifact | exists | size | modified (UTC) | description |", "| --- | ---: | ---: | --- | --- |"]
    for entry in ctx.artifacts:
        size = f"{entry.size_bytes:,} B" if entry.size_bytes else ("dir" if entry.exists else "—")
        exists = "yes" if entry.exists else "**no**"
        modified = entry.modified_at or "—"
        lines.append(
            f"| `{entry.path.name}` | {exists} | {size} | {modified} | {entry.description} |"
        )
        lines.append(f"| path: `{entry.path}` | | | | |")
    if ctx.warnings:
        lines.extend(["", "## Missing artifacts", ""])
        for w in ctx.warnings[:20]:
            lines.append(f"- {w}")
        if len(ctx.warnings) > 20:
            lines.append(f"- ... and {len(ctx.warnings) - 20} more")
    return "\n".join(lines) + "\n"


def render_data_quality(ctx: ReviewContext) -> str:
    summary = ctx.inspection.get("summary", {})
    lines = [
        "# Data Quality Summary",
        "",
        "## Candidate bank",
        "",
    ]
    if summary:
        lines.extend(
            [
                f"- Total rows: **{summary.get('total_rows', 'unknown')}**",
                f"- Missing name: {summary.get('missing_name', 'unknown')}",
                f"- Missing hex: {summary.get('missing_hex', 'unknown')}",
                f"- Missing descriptor: {summary.get('missing_descriptor', 'unknown')}",
                "",
                "### Source counts",
                "",
            ]
        )
        for src, cnt in sorted(summary.get("count_by_source", {}).items()):
            lines.append(f"- {src}: {cnt}")
        lines.extend(["", "### Family counts", ""])
        for fam, cnt in sorted(summary.get("count_by_family", {}).items(), key=lambda x: -x[1])[:15]:
            lines.append(f"- {fam}: {cnt}")
        desc = summary.get("descriptor_length", {})
        if desc:
            lines.extend(
                [
                    "",
                    "### Descriptor length",
                    "",
                    f"- mean: {desc.get('mean', '?'):.1f}" if isinstance(desc.get("mean"), (int, float)) else f"- mean: {desc.get('mean', '?')}",
                    f"- p95: {desc.get('p95', '?')}",
                    f"- max: {desc.get('max', '?')}",
                ]
            )
        suspicious = summary.get("suspicious_tokens", {})
        if suspicious:
            lines.extend(["", "### Suspicious tokens", ""])
            for tok, cnt in list(suspicious.items())[:10]:
                lines.append(f"- {tok}: {cnt}")
    else:
        lines.append("- Inspection JSON not available; run inspect_candidate_bank.")

    lines.extend(["", "## Training pairs", ""])
    if ctx.stats_md:
        total = _parse_stat_int(ctx.stats_md, "Total pairs")
        train_n = _parse_stat_int(ctx.stats_md, "train")
        val_n = _parse_stat_int(ctx.stats_md, "val")
        test_n = _parse_stat_int(ctx.stats_md, "test")
        leakage = _parse_leakage_passed(ctx.stats_md)
        lines.extend(
            [
                f"- Total pairs: **{total or 'unknown'}**",
                f"- train / val / test: {train_n or '?'} / {val_n or '?'} / {test_n or '?'}",
                f"- Leakage check passed: **{leakage if leakage is not None else 'unknown'}**",
            ]
        )
    else:
        lines.append("- stats.md not available; run build_training_pairs.")

    meta_val = next((a for a in ctx.artifacts if a.key == "metadata_val_pairs"), None)
    meta_test = next((a for a in ctx.artifacts if a.key == "metadata_test_pairs"), None)
    lines.extend(["", "### Metadata holdout", ""])
    if meta_val and meta_val.exists:
        lines.append(f"- metadata_val_pairs: present (`{meta_val.path}`)")
    else:
        lines.append("- metadata_val_pairs: missing")
    if meta_test and meta_test.exists:
        lines.append(f"- metadata_test_pairs: present (`{meta_test.path}`)")
    else:
        lines.append("- metadata_test_pairs: missing")

    lines.extend(
        [
            "",
            "## Why this matters",
            "",
            "- **Long descriptors** dilute embedding signal and make exact eval harder.",
            "- **Generic anchors** (e.g. calm, vibrant) create ambiguous training signal.",
            "- **Leakage=0** is required so val/test metrics reflect generalization, not memorization.",
            "- Current data is suitable for smoke tests; metadata-heavy training needs holdout diagnostics.",
            "",
        ]
    )
    return "\n".join(lines)


def render_training_summary(ctx: ReviewContext) -> str:
    ts = ctx.train_summary
    lines = ["# Training Summary", ""]
    if ts:
        for key in [
            "model_name",
            "loss",
            "train_pairs",
            "epochs",
            "batch_size",
            "lr",
            "output_dir",
            "final_model_dir",
            "finished_at",
        ]:
            if key in ts:
                lines.append(f"- {key}: `{ts[key]}`")
    else:
        lines.append("- train_summary.json not found (training may not have run).")

    model_entry = next((a for a in ctx.artifacts if a.key == "final_model_dir"), None)
    lines.extend(
        [
            "",
            f"- Final model exists: **{bool(model_entry and model_entry.exists)}**",
            "",
            "## Run types",
            "",
            "- `local_debug.yaml` — smoke test (sampled pairs, 1 epoch)",
            "- `full_train_local.yaml` — single-machine full pool validation (future)",
            "- `hpc_v2.yaml` — Slurm/HPC full training (Phase 8, isolated artifacts)",
            "- `hpc_v2_smoke.yaml` — Slurm/HPC smoke test (512 pairs, 1 epoch)",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def render_metrics(ctx: ReviewContext) -> str:
    lines = [
        "# Metrics — Baseline vs Fine-Tuned",
        "",
        "xkcd **val/test** mainly measure name→descriptor retrieval (short anchors).",
        "Metadata holdout reports **exact**, **anchor_group**, and **family_soft** separately.",
        "Low metadata exact R@1 is normal; prefer anchor_group / family_soft and recall@10.",
        "",
    ]
    for mode in METRIC_MODES:
        mode_rows = [r for r in ctx.metrics_rows if r.get("mode") == mode]
        if not mode_rows:
            continue
        lines.extend(
            [
                f"## {mode} metrics",
                "",
                "| split | metric | baseline | fine-tuned | delta |",
                "| --- | --- | ---: | ---: | ---: |",
            ]
        )
        for row in mode_rows:
            split = row["split"]
            for key in METRIC_KEYS:
                lines.append(
                    f"| {split} | {key} | {row[f'baseline_{key}']:.4f} | "
                    f"{row[f'finetuned_{key}']:.4f} | {row[f'delta_{key}']:+.4f} |"
                )
        lines.append("")

    lines.extend(
        [
            "## How to read this",
            "",
            "- Do not judge metadata success by exact R@1 alone.",
            "- **anchor_group**: same normalized anchor, any associated color_id is relevant.",
            "- **family_soft**: same color family as expected candidate is relevant.",
            "- Compare qualitative prompts for brand/mood phrases not covered by xkcd names.",
            "",
        ]
    )
    return "\n".join(lines)


def _format_hit(rank: int, hit: dict[str, Any]) -> str:
    family = hit.get("family_display") or hit.get("family")
    return (
        f"{rank}. {hit.get('name')} {hit.get('hex')} ({family}, "
        f"score={hit.get('score', 0):.3f})"
    )


def render_qualitative_review(ctx: ReviewContext) -> str:
    lines = ["# Qualitative Review", ""]
    for item in ctx.qualitative_verdicts:
        lines.extend(
            [
                f"## {item['prompt']}",
                "",
                f"- Expected families: {', '.join(item['expected_families'])}",
                f"- Verdict: **{item['verdict']}**",
                f"- Heuristic reason: {item.get('heuristic_reason', 'n/a')}",
                f"- Family match score (top-{QUALITATIVE_TOP_N}): baseline {item['baseline_family_score']} → fine-tuned {item['finetuned_family_score']}",
                "",
                "**Baseline top-5:**",
                "",
            ]
        )
        for i, hit in enumerate(item["baseline_hits"], start=1):
            lines.append(_format_hit(i, hit))
        lines.extend(["", "**Fine-tuned top-5:**", ""])
        for i, hit in enumerate(item["finetuned_hits"], start=1):
            lines.append(_format_hit(i, hit))
        lines.append("")
    return "\n".join(lines) + "\n"


def _likely_cause(hit: dict[str, Any], expected: list[str]) -> str:
    name = str(hit.get("name", ""))
    family = str(hit.get("family", "")).lower()
    if re.search(r"#[0-9A-Fa-f]{3,8}", name):
        return "descriptor noise / weird Color-Pedia name"
    if family and family not in expected:
        return "source imbalance or weak training signal for this mood"
    return "exact eval too strict or generic anchor"


def _collect_failure_cases(ctx: ReviewContext) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    expected_map = get_expected_families(ctx.cfg)

    for item in ctx.qualitative_verdicts:
        if item["verdict"] in {VERDICT_REGRESSED, VERDICT_NEEDS_REVIEW, VERDICT_UNCHANGED_BAD}:
            cases.append(
                {
                    "query": item["prompt"],
                    "expected": item["expected_families"],
                    "top5": item["finetuned_hits"],
                    "cause": f"qualitative verdict={item['verdict']}",
                    "fix": "Add user_curated pairs for this mood; clean descriptors; full training",
                }
            )

    for split_key in ("metadata_test", "test", "val"):
        report = ctx.finetuned_retrieval.get(split_key, {})
        for ex in report.get("worst_examples", [])[:10]:
            cases.append(
                {
                    "query": ex.get("anchor"),
                    "expected": ex.get("expected_color_id") or ex.get("expected_family"),
                    "top5": ex.get("top5", []),
                    "cause": f"low rank on {split_key} (first_relevant_rank={ex.get('first_relevant_rank')})",
                    "fix": "Review anchor-generic terms; add curated pairs; check descriptor truncation",
                }
            )

    for item in ctx.qualitative_verdicts:
        expected = expected_map.get(item["prompt"], [])
        for hit in item["finetuned_hits"][:3]:
            name = str(hit.get("name", ""))
            if re.search(r"[0-9A-F]{6,}", name) or "Hexadecimal" in name:
                cases.append(
                    {
                        "query": item["prompt"],
                        "expected": expected,
                        "top5": [hit],
                        "cause": "weird color name from Color-Pedia metadata",
                        "fix": "Clean Color-Pedia descriptors and display names",
                    }
                )

    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for case in cases:
        key = f"{case.get('query')}|{case.get('cause')}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(case)
    return deduped[:40]


def render_failure_cases(ctx: ReviewContext) -> str:
    cases = _collect_failure_cases(ctx)
    lines = ["# Failure Cases", ""]
    if not cases:
        lines.append("No major failure cases collected (or eval artifacts missing).")
        return "\n".join(lines) + "\n"

    for i, case in enumerate(cases, start=1):
        lines.extend(
            [
                f"## Case {i}",
                "",
                f"- **Query:** {case.get('query')}",
                f"- **Expected:** {case.get('expected')}",
                f"- **Likely cause:** {case.get('cause')}",
                f"- **Suggested fix:** {case.get('fix')}",
                "",
                "**Predicted top-5:**",
                "",
            ]
        )
        for j, hit in enumerate(case.get("top5", [])[:5], start=1):
            lines.append(_format_hit(j, hit))
        lines.append("")
    return "\n".join(lines)


def _format_metric_delta(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:+.4f}"


def _resolve_metric_delta(
    ctx: ReviewContext,
    split: str,
    mode: str,
    metric_key: str,
) -> float | None:
    delta = lookup_metric_delta(ctx.metrics_rows, split, mode, metric_key)
    if delta is not None:
        return delta
    return metric_delta_from_reports(
        ctx.baseline_retrieval,
        ctx.finetuned_retrieval,
        split,
        mode,
        metric_key,
    )


def render_key_metrics_summary(ctx: ReviewContext) -> str:
    """Compact table of headline deltas used in go/no-go review."""
    rows_spec = [
        ("val", "exact", "recall@10", "xkcd val exact R@10"),
        ("test", "exact", "recall@10", "xkcd test exact R@10"),
        ("metadata_test", "exact", "recall@10", "metadata_test exact R@10"),
        ("metadata_test", "anchor_group", "recall@10", "metadata_test anchor_group R@10"),
        ("metadata_test", "family_soft", "recall@5", "metadata_test family_soft R@5"),
    ]
    lines = [
        "## Key metric deltas",
        "",
        "| check | delta |",
        "| --- | ---: |",
    ]
    for split, mode, metric_key, label in rows_spec:
        delta = _resolve_metric_delta(ctx, split, mode, metric_key)
        lines.append(f"| {label} | {_format_metric_delta(delta)} |")
    lines.append("")
    return "\n".join(lines)


def render_go_no_go(ctx: ReviewContext) -> str:
    lines = [
        "# Go / No-Go Decision",
        "",
        f"## Decision: **{ctx.decision}**",
        "",
        render_key_metrics_summary(ctx),
        "### Reasons",
        "",
    ]
    for r in ctx.decision_reasons:
        lines.append(f"- {r}")
    lines.extend(["", "### Next recommended actions", ""])
    for a in ctx.next_actions:
        lines.append(f"- {a}")
    lines.extend(
        [
            "",
            "### Decision legend",
            "",
            "- **GREEN** — proceed to HPC / Slurm full training",
            "- **YELLOW** — pipeline works; run full local training or fix data first",
            "- **RED** — do not scale; fix pipeline, leakage, or eval artifacts",
            "",
        ]
    )
    return "\n".join(lines)


def render_model_card(ctx: ReviewContext) -> str:
    ts = ctx.train_summary
    model_name = ts.get("model_name", str(ctx.cfg.model.get("name", "unknown")))
    final_dir = ts.get("final_model_dir", str(ctx.cfg.train.get("final_model_dir", "")))
    return "\n".join(
        [
            "# Model Card",
            "",
            f"- **Model name:** {model_name}",
            f"- **Fine-tuned checkpoint:** `{final_dir}`",
            f"- **Review run id:** {ctx.run_id}",
            f"- **Date:** {datetime.now(timezone.utc).date().isoformat()}",
            "",
            "## Intended use",
            "",
            "English text queries (brand moods, adjectives, short phrases) → top-k color retrieval",
            "via cosine similarity over precomputed color descriptor embeddings.",
            "",
            "## Not intended for",
            "",
            "- Generating new color hex codes from scratch",
            "- Accessibility-compliant contrast selection without post-processing",
            "- Non-English text (not validated)",
            "",
            "## Data sources",
            "",
            "- xkcd color names",
            "- Color-Pedia metadata descriptors",
            "- Optional user_curated pairs",
            "",
            "## Training method",
            "",
            f"- Loss: {ts.get('loss', 'mnrl')}",
            f"- Pairs used: {ts.get('train_pairs', 'unknown')}",
            "",
            "## Evaluation summary",
            "",
            f"- Decision: **{ctx.decision}**",
            f"- Metrics rows: {len(ctx.metrics_rows)}",
            "",
            "## Limitations",
            "",
            "- Metadata exact eval is strict; semantic mood matching needs qualitative review.",
            "- Color-Pedia descriptor noise can produce odd top-k names.",
            "- val/test skew toward xkcd name matching due to grouped split.",
            "",
            "## Known failure modes",
            "",
            "- Generic anchors (calm, vibrant) retrieve over-broad families",
            "- Long descriptors weaken embedding focus",
            "- Source imbalance (Color-Pedia vs xkcd) in top-k",
            "",
            "## Design / ethics notes",
            "",
            "Color–language associations are culturally loaded; do not treat outputs as universal truths.",
            "",
        ]
    ) + "\n"


def render_reproduce_commands(ctx: ReviewContext) -> str:
    cfg_rel = ctx.config_path
    try:
        cfg_rel = ctx.config_path.relative_to(get_project_root())
    except ValueError:
        pass
    cfg_str = str(cfg_rel)
    return "\n".join(
        [
            "#!/usr/bin/env bash",
            "set -euo pipefail",
            "",
            f"# Reproduce pipeline for run_id={ctx.run_id}",
            "",
            f"python -m colorrec.data.build_candidate_bank --config {cfg_str}",
            f"python -m colorrec.data.inspect_candidate_bank --config {cfg_str}",
            f"python -m colorrec.data.build_training_pairs --config {cfg_str}",
            f"python -m colorrec.evaluation.baseline_retrieval --config {cfg_str}",
            f"python -m colorrec.training.train_sentence_transformer --config {cfg_str} --run_eval_after_train",
            f"python -m colorrec.evaluation.compare_runs --config {cfg_str}",
            f"python -m colorrec.evaluation.success_review --config {cfg_str} --run_id {ctx.run_id}",
            "",
        ]
    )


def build_run_metadata(ctx: ReviewContext) -> dict[str, Any]:
    git_commit = None
    try:
        git_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=get_project_root(),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "run_id": ctx.run_id,
        "config_path": str(ctx.config_path),
        "output_dir": str(ctx.output_dir),
        "git_commit": git_commit,
        "python_version": sys.version,
        "platform": platform.platform(),
        "decision": ctx.decision,
        "pytest_passed": ctx.pytest_passed,
        "model_path": ctx.train_summary.get("final_model_dir"),
        "paths": {
            entry.key: str(entry.path) for entry in ctx.artifacts if entry.exists
        },
        "warnings_count": len(ctx.warnings),
    }


def generate_success_review(
    cfg: DictConfig,
    *,
    run_id: str | None = None,
    output_dir: Path | None = None,
    config_path: Path | None = None,
    pytest_passed: bool | None = None,
) -> Path:
    """Generate the full success review folder."""
    if run_id is None:
        run_id = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")

    base_out = output_dir
    if base_out is None:
        sr_cfg = cfg.evaluation.get("success_review", {})
        base_out = resolve_path(str(sr_cfg.get("output_dir", "artifacts/success_review")))
        base_out = base_out / run_id
    base_out.mkdir(parents=True, exist_ok=True)

    cfg_path = config_path or Path("configs/local_debug.yaml")
    ctx = load_review_context(cfg, run_id=run_id, output_dir=base_out, config_path=cfg_path, pytest_passed=pytest_passed)
    decide_go_no_go(ctx)

    files = {
        "00_README.md": render_readme(ctx),
        "01_artifact_manifest.md": render_artifact_manifest(ctx),
        "02_data_quality.md": render_data_quality(ctx),
        "03_training_summary.md": render_training_summary(ctx),
        "04_metrics_baseline_vs_finetuned.md": render_metrics(ctx),
        "05_qualitative_review.md": render_qualitative_review(ctx),
        "06_failure_cases.md": render_failure_cases(ctx),
        "07_go_no_go_decision.md": render_go_no_go(ctx),
        "model_card.md": render_model_card(ctx),
        "reproduce_commands.sh": render_reproduce_commands(ctx),
    }

    for name, content in files.items():
        path = base_out / name
        path.write_text(content, encoding="utf-8")
        if name.endswith(".sh"):
            path.chmod(0o755)

    criteria_path = base_out / "success_criteria.yaml"
    criteria_path.write_text(
        yaml.safe_dump(default_success_criteria(), sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )

    meta_path = base_out / "run_metadata.json"
    meta_path.write_text(
        json.dumps(build_run_metadata(ctx), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    logger.info("Success review written to %s (decision=%s)", base_out, ctx.decision)
    for w in ctx.warnings[:5]:
        logger.warning(w)
    if len(ctx.warnings) > 5:
        logger.warning("... and %d more missing artifacts", len(ctx.warnings) - 5)

    return base_out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a success review folder from baseline/fine-tuned eval artifacts."
    )
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument("--run_id", type=str, default=None, help="Review folder name under output_dir")
    parser.add_argument(
        "--output_dir",
        type=str,
        default=None,
        help="Override full output directory (instead of output_dir/run_id)",
    )
    parser.add_argument(
        "--pytest_passed",
        type=str,
        default=None,
        choices=["true", "false"],
        help="Optional pytest status for go/no-go engineering check",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg_path = resolve_path(args.config)
    cfg = load_config(cfg_path)

    pytest_passed: bool | None = None
    if args.pytest_passed == "true":
        pytest_passed = True
    elif args.pytest_passed == "false":
        pytest_passed = False

    out = None
    if args.output_dir:
        out = resolve_path(args.output_dir)

    generate_success_review(
        cfg,
        run_id=args.run_id,
        output_dir=out,
        config_path=cfg_path,
        pytest_passed=pytest_passed,
    )


if __name__ == "__main__":
    main()
