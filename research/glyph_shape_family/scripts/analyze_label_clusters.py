#!/usr/bin/env python3
"""
Given a cluster / color label column, estimate which skeleton features best
explain label separation (RF + permutation + MI + ANOVA F + Kruskal-Wallis).

Example (label already in features.csv):
  python scripts/analyze_label_clusters.py features.csv --label-column color_cluster -o analysis_out

Example (merge labels from another file):
  python scripts/analyze_label_clusters.py features.csv \\
    --labels-csv colors.csv --join-on source_path --label-column cluster_id -o analysis_out
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from glyph_shape_family.analysis.label_screening import screen_features_for_labels
from glyph_shape_family.integrations.letter_priors_client import (
    LAB_LEAK_COLUMNS,
    default_api_base,
    fetch_letter_priors,
    letter_priors_to_color_clusters,
    merge_features_with_color_clusters,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("features_csv", type=Path, help="Wide table from extract_features.py (+ your label column)")
    p.add_argument(
        "--label-column",
        type=str,
        default=None,
        help="Column name for cluster / color group id (default: color_cluster when using --from-letter-priors-api)",
    )
    p.add_argument(
        "--labels-csv",
        type=Path,
        default=None,
        help="Optional CSV merged on --join-on to add or override labels",
    )
    p.add_argument(
        "--join-on",
        type=str,
        default="source_path",
        help="Column to merge features with --labels-csv (default: source_path)",
    )
    p.add_argument(
        "--exclude-columns",
        type=str,
        default="",
        help="Comma-separated extra columns to exclude from X (in addition to defaults)",
    )
    p.add_argument("-o", "--output-dir", type=Path, default=Path("label_analysis_out"))
    p.add_argument("--prefix", type=str, default="screen")
    p.add_argument("--random-state", type=int, default=42)
    p.add_argument("--n-permutation-repeats", type=int, default=30)
    p.add_argument("--n-trees", type=int, default=200)
    p.add_argument("--n-jobs", type=int, default=1, help="Parallel jobs for RF/permutation (-1 = all cores)")
    p.add_argument(
        "--from-letter-priors-api",
        action="store_true",
        help="Fetch GET /api/letter-priors, K-means on avg Lab per letter → color_cluster, merge on glyph_label",
    )
    p.add_argument(
        "--api-base",
        type=str,
        default=None,
        help=f"SynGlyph API base URL (default: env SYNGLYPH_API_URL or {default_api_base()})",
    )
    p.add_argument(
        "--dataset-ids",
        type=str,
        default=None,
        help="Comma-separated dataset IDs passed to letter-priors (omit = all datasets)",
    )
    p.add_argument(
        "--color-clusters-k",
        type=int,
        default=8,
        help="Requested K for K-means on (avg_l, avg_a, avg_b) per letter (capped by #letters)",
    )
    p.add_argument(
        "--save-merged",
        type=Path,
        default=None,
        help="Write merged features+labels CSV here (default: <output-dir>/features_with_color_labels.csv)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    label_col = args.label_column
    if args.from_letter_priors_api:
        if label_col is None:
            label_col = "color_cluster"
    elif label_col is None:
        raise SystemExit("Missing --label-column (or use --from-letter-priors-api for default color_cluster).")

    df = pd.read_csv(args.features_csv)
    if args.from_letter_priors_api and args.labels_csv is not None:
        raise SystemExit("Use only one of --from-letter-priors-api or --labels-csv.")

    if args.from_letter_priors_api:
        api_base = args.api_base or default_api_base()
        priors = fetch_letter_priors(api_base, dataset_ids=args.dataset_ids)
        letter_tab, pri_meta = letter_priors_to_color_clusters(
            priors, n_clusters=args.color_clusters_k, random_state=args.random_state
        )
        df = merge_features_with_color_clusters(df, letter_tab)
        if len(df) == 0:
            raise SystemExit(
                "No rows left after merging API letter priors. "
                "Check glyph_label letters match annotated letters in the API."
            )
        args.output_dir.mkdir(parents=True, exist_ok=True)
        merged_path = args.save_merged or (args.output_dir / "features_with_color_labels.csv")
        df.to_csv(merged_path, index=False)
        print(
            f"Merged {len(df)} rows from API letter priors → {merged_path} "
            f"(letters with data: {pri_meta['n_letters']}, K={pri_meta['n_clusters_effective']})"
        )
        (args.output_dir / "letter_priors_api_meta.json").write_text(
            json.dumps(pri_meta, indent=2), encoding="utf-8"
        )
        extra_lab = set(LAB_LEAK_COLUMNS) & set(df.columns)
        if extra_lab:
            args.exclude_columns = ",".join(
                [c for c in args.exclude_columns.split(",") if c.strip()]
                + list(extra_lab)
            )

    elif args.labels_csv is not None:
        lab = pd.read_csv(args.labels_csv)
        if args.join_on not in df.columns:
            raise SystemExit(f"features CSV missing join column {args.join_on!r}")
        if args.join_on not in lab.columns:
            raise SystemExit(f"labels CSV missing join column {args.join_on!r}")
        if label_col not in lab.columns:
            raise SystemExit(f"labels CSV missing column {label_col!r}")
        sub = lab[[args.join_on, label_col]].drop_duplicates(subset=[args.join_on])
        df = df.drop(columns=[label_col], errors="ignore")
        df = df.merge(sub, on=args.join_on, how="inner")

    if label_col not in df.columns:
        cols = list(df.columns)
        preview = ", ".join(cols[:40]) + (" …" if len(cols) > 40 else "")
        raise SystemExit(
            f"Missing label column {label_col!r}.\n"
            f"  Columns in merged data: {preview}\n"
            f"  Fix: add that column, use --from-letter-priors-api, or --labels-csv …"
        )

    extra = {c.strip() for c in args.exclude_columns.split(",") if c.strip()}

    out = screen_features_for_labels(
        df,
        label_col,
        random_state=args.random_state,
        n_rf_estimators=args.n_trees,
        n_permutation_repeats=args.n_permutation_repeats,
        extra_exclude_columns=extra,
        n_jobs=args.n_jobs,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    pref = args.prefix
    out["rf_importance"].to_csv(args.output_dir / f"{pref}_rf_importance.csv", index=False)
    out["permutation"].to_csv(args.output_dir / f"{pref}_permutation_importance.csv", index=False)
    out["mutual_information"].to_csv(args.output_dir / f"{pref}_mutual_information.csv", index=False)
    out["f_classif"].to_csv(args.output_dir / f"{pref}_f_classif.csv", index=False)
    out["kruskal_wallis"].to_csv(args.output_dir / f"{pref}_kruskal_wallis.csv", index=False)
    out["composite"].to_csv(args.output_dir / f"{pref}_composite_ranking.csv", index=False)

    meta_path = args.output_dir / f"{pref}_meta.json"
    meta = out["meta"]
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    top = out["composite"].head(15)
    report = args.output_dir / f"{pref}_report.md"
    lines = [
        "# Label → feature screening",
        "",
        f"- Samples: {meta['n_samples']}",
        f"- Features: {meta['n_features']}",
        f"- Classes: {meta['n_classes']} — {meta['class_names']}",
        f"- Label column: `{label_col}`",
        "",
        "## Top 15 by composite rank (mean of normalized ranks across methods)",
        "",
        "```",
        top.to_string(index=False),
        "```",
        "",
        "## Interpretation",
        "",
        "- **rf_gini_importance**: RandomForest split impurity (supervised fit).",
        "- **perm_importance_mean**: drop in accuracy when feature shuffled.",
        "- **mutual_information**: dependency between feature and label.",
        "- **f_statistic / f_pvalue**: ANOVA F between label groups.",
        "- **kruskal_wallis**: non-parametric rank test across groups.",
        "",
        "High composite_score = consistently important across methods. ",
        "Confounding: if labels correlate with letter identity, shape features may proxy letter.",
        "",
    ]
    report.write_text("\n".join(lines), encoding="utf-8")

    print(f"Wrote CSVs and {report} under {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
