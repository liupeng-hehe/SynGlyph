"""Offline quality inspection for candidate color bank parquet files."""

from __future__ import annotations

import argparse
import json
import logging
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from omegaconf import DictConfig, OmegaConf

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.logging_utils import set_seed, setup_logging

logger = logging.getLogger(__name__)

DEFAULT_OVERUSED_TOKENS = [
    "beautiful",
    "aesthetic",
    "creative",
    "modern",
    "elegant",
    "emotional",
    "expressive",
    "vibrant",
    "sophisticated",
]

METADATA_FIELDS = (
    "mood",
    "emotion",
    "symbolism",
    "personality",
    "keywords",
    "use_case",
    "extra_fields",
)


def _normalize_name(name: str) -> str:
    return " ".join(str(name).strip().lower().split())


def _tokenize_descriptor(text: str) -> list[str]:
    if not isinstance(text, str) or not text.strip():
        return []
    parts = re.split(r"[,;/|]+", text.lower())
    tokens: list[str] = []
    for part in parts:
        for tok in re.findall(r"[a-z0-9]+", part):
            if tok:
                tokens.append(tok)
    return tokens


def _parse_metadata(val: Any) -> dict[str, Any]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _length_stats(lengths: pd.Series) -> dict[str, float]:
    if lengths.empty:
        return {"min": 0.0, "mean": 0.0, "p50": 0.0, "p90": 0.0, "p95": 0.0, "max": 0.0}
    arr = lengths.astype(float)
    return {
        "min": float(arr.min()),
        "mean": float(arr.mean()),
        "p50": float(np.percentile(arr, 50)),
        "p90": float(np.percentile(arr, 90)),
        "p95": float(np.percentile(arr, 95)),
        "max": float(arr.max()),
    }


def _metadata_coverage(df: pd.DataFrame) -> dict[str, Any]:
    if "metadata" not in df.columns:
        return {"rows_with_metadata": 0, "field_coverage": {}}

    parsed = df["metadata"].apply(_parse_metadata)
    rows_with_metadata = int(parsed.apply(bool).sum())
    field_counts: Counter[str] = Counter()
    for meta in parsed:
        for key in meta.keys():
            field_counts[key] += 1
    total = len(df)
    return {
        "rows_with_metadata": rows_with_metadata,
        "field_coverage": {k: {"count": v, "pct": v / total} for k, v in sorted(field_counts.items())},
    }


def _token_analysis(
    df: pd.DataFrame,
    *,
    suspicious_tokens: list[str],
    overused_tokens: list[str],
    overused_warn_pct: float,
) -> dict[str, Any]:
    all_tokens: list[str] = []
    for desc in df["descriptor"].fillna(""):
        all_tokens.extend(_tokenize_descriptor(str(desc)))

    total_tokens = len(all_tokens) or 1
    counts = Counter(all_tokens)
    top_100 = [
        {"token": tok, "count": cnt, "pct": cnt / total_tokens}
        for tok, cnt in counts.most_common(100)
    ]

    bigram_counts: Counter[str] = Counter()
    for desc in df["descriptor"].fillna(""):
        toks = _tokenize_descriptor(str(desc))
        for i in range(len(toks) - 1):
            bigram_counts[f"{toks[i]} {toks[i + 1]}"] += 1
    top_50_bigrams = [
        {"bigram": bg, "count": cnt, "pct": cnt / max(sum(bigram_counts.values()), 1)}
        for bg, cnt in bigram_counts.most_common(50)
    ]

    clean_suspicious = [str(t) for t in suspicious_tokens if t is not None]
    suspicious_set = {t.lower() for t in clean_suspicious}
    suspicious_found = [
        {"token": tok, "count": counts[tok], "pct": counts[tok] / total_tokens}
        for tok in sorted(suspicious_set)
        if tok in counts
    ]

    overused_found: list[dict[str, Any]] = []
    warnings: list[str] = []
    for tok in overused_tokens:
        cnt = counts.get(tok.lower(), 0)
        pct = cnt / total_tokens
        entry = {"token": tok, "count": cnt, "pct": pct}
        overused_found.append(entry)
        if pct >= overused_warn_pct:
            msg = f"Overused token '{tok}' appears in {pct:.1%} of descriptor tokens (threshold {overused_warn_pct:.0%})"
            warnings.append(msg)
            logger.warning(msg)

    for item in suspicious_found:
        msg = f"Suspicious token '{item['token']}' found {item['count']} times ({item['pct']:.2%})"
        warnings.append(msg)
        logger.warning(msg)

    return {
        "total_tokens": total_tokens,
        "unique_tokens": len(counts),
        "top_100_tokens": top_100,
        "top_50_bigrams": top_50_bigrams,
        "suspicious_tokens": suspicious_found,
        "overused_semantic_tokens": overused_found,
        "warnings": warnings,
    }


def _duplicate_analysis(df: pd.DataFrame) -> dict[str, Any]:
    work = df.copy()
    work["norm_name"] = work["name"].astype(str).map(_normalize_name)
    work["hex_upper"] = work["hex"].astype(str).str.upper()

    dup_name_hex = work.groupby(["norm_name", "hex_upper"]).size()
    dup_name_hex_count = int((dup_name_hex > 1).sum())
    dup_name_hex_examples = [
        {
            "norm_name": name,
            "hex": hex_val,
            "count": int(cnt),
            "names": work.loc[
                (work["norm_name"] == name) & (work["hex_upper"] == hex_val), "name"
            ].tolist(),
        }
        for (name, hex_val), cnt in dup_name_hex[dup_name_hex > 1].head(10).items()
    ]

    hex_groups = work.groupby("hex_upper")["name"].apply(list)
    same_hex_diff_names = [
        {"hex": hex_val, "names": names, "count": len(names)}
        for hex_val, names in hex_groups.items()
        if len(set(_normalize_name(n) for n in names)) > 1
    ]
    same_hex_diff_names.sort(key=lambda x: x["count"], reverse=True)

    name_groups = work.groupby("norm_name")["hex_upper"].apply(lambda s: sorted(set(s)))
    same_name_diff_hex = [
        {"norm_name": name, "hexes": hexes, "count": len(hexes)}
        for name, hexes in name_groups.items()
        if len(hexes) > 1
    ]
    same_name_diff_hex.sort(key=lambda x: x["count"], reverse=True)

    desc_counts = work["descriptor"].value_counts()
    dup_desc = desc_counts[desc_counts > 1]
    dup_desc_examples = [
        {
            "descriptor": desc[:120] + ("..." if len(desc) > 120 else ""),
            "count": int(cnt),
            "names": work.loc[work["descriptor"] == desc, "name"].head(5).tolist(),
        }
        for desc, cnt in dup_desc.head(10).items()
    ]

    return {
        "duplicate_by_norm_name_and_hex_groups": dup_name_hex_count,
        "duplicate_by_norm_name_and_hex_examples": dup_name_hex_examples,
        "same_hex_different_names_count": len(same_hex_diff_names),
        "same_hex_different_names_top": same_hex_diff_names[:10],
        "same_norm_name_different_hex_count": len(same_name_diff_hex),
        "same_norm_name_different_hex_top": same_name_diff_hex[:10],
        "duplicate_descriptor_exact_count": int((desc_counts > 1).sum()),
        "duplicate_descriptor_exact_top": dup_desc_examples,
    }


def _source_comparison(df: pd.DataFrame) -> dict[str, Any]:
    by_source: dict[str, Any] = {}
    for source, sub in df.groupby("source"):
        lengths = sub["descriptor"].fillna("").astype(str).str.len()
        families = sub["family"].value_counts().to_dict()
        meta_cov = _metadata_coverage(sub)
        by_source[str(source)] = {
            "count": int(len(sub)),
            "descriptor_length": _length_stats(lengths),
            "family_distribution": {str(k): int(v) for k, v in families.items()},
            "metadata_coverage": meta_cov,
        }
    return by_source


def _sample_rows(df: pd.DataFrame, n: int, seed: int) -> list[dict[str, Any]]:
    if df.empty:
        return []
    sample = df.sample(n=min(n, len(df)), random_state=seed)
    cols = ["name", "hex", "family", "source", "descriptor"]
    out = []
    for _, row in sample.iterrows():
        out.append({c: row[c] if c in row else None for c in cols})
    return out


def _row_dict(row: pd.Series) -> dict[str, Any]:
    return {
        "name": row.get("name"),
        "hex": row.get("hex"),
        "family": row.get("family"),
        "source": row.get("source"),
        "descriptor": row.get("descriptor"),
    }


def _suspicious_rows(df: pd.DataFrame, suspicious_tokens: list[str]) -> list[dict[str, Any]]:
    suspicious_set = set(t.lower() for t in suspicious_tokens)
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        toks = set(_tokenize_descriptor(str(row.get("descriptor", ""))))
        hits = sorted(suspicious_set & toks)
        if hits:
            item = _row_dict(row)
            item["suspicious_hits"] = hits
            rows.append(item)
        if len(rows) >= 20:
            break
    return rows


def inspect_candidate_bank_df(
    df: pd.DataFrame,
    *,
    inspection_cfg: DictConfig | dict,
    seed: int = 42,
) -> dict[str, Any]:
    """Run all inspection checks on a candidate bank dataframe."""
    if isinstance(inspection_cfg, dict):
        cfg = inspection_cfg
    else:
        cfg = OmegaConf.to_container(inspection_cfg, resolve=True)

    required = {"name", "hex", "descriptor", "source", "family"}
    missing_cols = required - set(df.columns)
    if missing_cols:
        raise ValueError(f"Candidate bank parquet missing columns: {sorted(missing_cols)}")

    desc_lengths = df["descriptor"].fillna("").astype(str).str.len()
    max_recommended = int(cfg.get("descriptor_max_recommended_chars", 256))
    overused_warn_pct = float(cfg.get("overused_token_warn_pct", 0.25))
    suspicious_tokens = [t for t in list(cfg.get("suspicious_tokens") or []) if t is not None]

    missing_name = int(df["name"].isna().sum() + (df["name"].astype(str).str.strip() == "").sum())
    missing_hex = int(df["hex"].isna().sum() + (df["hex"].astype(str).str.strip() == "").sum())
    missing_descriptor = int(
        df["descriptor"].isna().sum() + (df["descriptor"].astype(str).str.strip() == "").sum()
    )

    warnings: list[str] = []
    overlong = int((desc_lengths > max_recommended).sum())
    if overlong:
        msg = f"{overlong} descriptors exceed recommended max length ({max_recommended} chars)"
        warnings.append(msg)
        logger.warning(msg)

    token_report = _token_analysis(
        df,
        suspicious_tokens=suspicious_tokens,
        overused_tokens=DEFAULT_OVERUSED_TOKENS,
        overused_warn_pct=overused_warn_pct,
    )
    warnings.extend(token_report.pop("warnings", []))

    report: dict[str, Any] = {
        "summary": {
            "total_rows": int(len(df)),
            "count_by_source": {str(k): int(v) for k, v in df["source"].value_counts().items()},
            "count_by_family": {str(k): int(v) for k, v in df["family"].value_counts().items()},
            "missing_name": missing_name,
            "missing_hex": missing_hex,
            "missing_descriptor": missing_descriptor,
            "descriptor_length": _length_stats(desc_lengths),
            "descriptors_over_recommended_max": overlong,
            "descriptor_max_recommended_chars": max_recommended,
            "metadata_coverage": _metadata_coverage(df),
        },
        "descriptor_tokens": token_report,
        "duplicates": _duplicate_analysis(df),
        "source_comparison": _source_comparison(df),
        "samples": {},
        "warnings": warnings,
    }

    rng_seed = seed
    samples: dict[str, Any] = {}
    for family in sorted(df["family"].dropna().unique()):
        sub = df[df["family"] == family]
        samples[f"family_{family}"] = _sample_rows(sub, 10, rng_seed)
        rng_seed += 1
    for source in sorted(df["source"].dropna().unique()):
        sub = df[df["source"] == source]
        samples[f"source_{source}"] = _sample_rows(sub, 10, rng_seed)
        rng_seed += 1

    work = df.copy()
    work["_desc_len"] = work["descriptor"].fillna("").astype(str).str.len()
    samples["longest_20_descriptors"] = [
        _row_dict(row) for _, row in work.nlargest(20, "_desc_len").iterrows()
    ]
    samples["shortest_20_descriptors"] = [
        _row_dict(row) for _, row in work.nsmallest(20, "_desc_len").iterrows()
    ]
    samples["suspicious_rows"] = _suspicious_rows(df, suspicious_tokens)
    report["samples"] = samples

    return report


def _render_markdown(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        "# Candidate Bank Inspection Report",
        "",
        "## 1. Overall statistics",
        "",
        f"- Total rows: **{s['total_rows']}**",
        f"- Missing name: **{s['missing_name']}**",
        f"- Missing hex: **{s['missing_hex']}**",
        f"- Missing descriptor: **{s['missing_descriptor']}**",
        f"- Descriptors over recommended max ({s['descriptor_max_recommended_chars']} chars): **{s['descriptors_over_recommended_max']}**",
        "",
        "### Count by source",
        "",
    ]
    for src, cnt in sorted(s["count_by_source"].items()):
        lines.append(f"- {src}: {cnt}")
    lines.extend(["", "### Count by family", ""])
    for fam, cnt in sorted(s["count_by_family"].items()):
        lines.append(f"- {fam}: {cnt}")

    dl = s["descriptor_length"]
    lines.extend(
        [
            "",
            "### Descriptor length",
            "",
            f"- min: {dl['min']:.1f}",
            f"- mean: {dl['mean']:.1f}",
            f"- p50: {dl['p50']:.1f}",
            f"- p90: {dl['p90']:.1f}",
            f"- p95: {dl['p95']:.1f}",
            f"- max: {dl['max']:.1f}",
            "",
            "### Metadata field coverage",
            "",
        ]
    )
    meta = s["metadata_coverage"]
    lines.append(f"- Rows with metadata: {meta.get('rows_with_metadata', 0)}")
    for field, info in meta.get("field_coverage", {}).items():
        lines.append(f"- {field}: {info['count']} ({info['pct']:.1%})")

    tok = report["descriptor_tokens"]
    lines.extend(["", "## 2. Descriptor token analysis", "", "### Top 20 tokens", ""])
    lines.append("| token | count | pct |")
    lines.append("| --- | ---: | ---: |")
    for item in tok["top_100_tokens"][:20]:
        lines.append(f"| {item['token']} | {item['count']} | {item['pct']:.2%} |")

    if tok.get("suspicious_tokens"):
        lines.extend(["", "### Suspicious tokens", ""])
        for item in tok["suspicious_tokens"]:
            lines.append(f"- `{item['token']}`: {item['count']} ({item['pct']:.2%})")

    lines.extend(["", "### Overused semantic tokens", ""])
    for item in tok["overused_semantic_tokens"]:
        lines.append(f"- `{item['token']}`: {item['count']} ({item['pct']:.2%})")

    dup = report["duplicates"]
    lines.extend(
        [
            "",
            "## 3. Duplicate analysis",
            "",
            f"- Duplicate (norm_name + hex) groups: **{dup['duplicate_by_norm_name_and_hex_groups']}**",
            f"- Same hex, different names: **{dup['same_hex_different_names_count']}**",
            f"- Same norm name, different hex: **{dup['same_norm_name_different_hex_count']}**",
            f"- Exact duplicate descriptors: **{dup['duplicate_descriptor_exact_count']}**",
            "",
        ]
    )
    if dup["same_hex_different_names_top"]:
        lines.append("### Same hex, different names (top)")
        for ex in dup["same_hex_different_names_top"][:5]:
            lines.append(f"- {ex['hex']}: {ex['names'][:5]}")

    if dup["same_norm_name_different_hex_top"]:
        lines.append("")
        lines.append("### Same normalized name, different hex (top)")
        for ex in dup["same_norm_name_different_hex_top"][:5]:
            lines.append(f"- {ex['norm_name']}: {ex['hexes'][:5]}")

    lines.extend(["", "## 4. Source comparison", ""])
    for source, info in sorted(report["source_comparison"].items()):
        dl_s = info["descriptor_length"]
        lines.append(f"### {source}")
        lines.append(f"- count: {info['count']}")
        lines.append(f"- descriptor mean length: {dl_s['mean']:.1f}")
        lines.append(f"- metadata rows: {info['metadata_coverage'].get('rows_with_metadata', 0)}")

    if report.get("warnings"):
        lines.extend(["", "## Warnings", ""])
        for w in report["warnings"]:
            lines.append(f"- {w}")

    lines.extend(["", "## 5. Sample sections", ""])
    lines.append("- See JSON report for full random/longest/shortest/suspicious samples.")

    return "\n".join(lines) + "\n"


def inspect_candidate_bank(cfg: DictConfig) -> dict[str, Any]:
    """Load parquet (read-only), inspect, and write reports."""
    parquet_path = get_path(cfg, "candidate_bank_parquet")
    if not parquet_path.exists():
        raise FileNotFoundError(
            f"Candidate bank parquet not found at {parquet_path}. "
            "Run build_candidate_bank first."
        )

    md_path = get_path(cfg, "candidate_bank_inspection_md")
    json_path = get_path(cfg, "candidate_bank_inspection_json")

    seed = int(cfg.project.get("seed", 42))
    set_seed(seed)

    logger.info("Reading candidate bank (read-only): %s", parquet_path)
    df = pd.read_parquet(parquet_path)

    inspection_cfg = cfg.data.get("inspection", {})
    report = inspect_candidate_bank_df(df, inspection_cfg=inspection_cfg, seed=seed)

    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(_render_markdown(report), encoding="utf-8")
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")

    logger.info("Wrote inspection markdown: %s", md_path)
    logger.info("Wrote inspection JSON: %s", json_path)
    if report.get("warnings"):
        logger.warning("Inspection completed with %d warnings", len(report["warnings"]))
    else:
        logger.info("Inspection completed with no threshold warnings")

    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect candidate color bank parquet quality (read-only)."
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
    inspect_candidate_bank(cfg)


if __name__ == "__main__":
    main()
