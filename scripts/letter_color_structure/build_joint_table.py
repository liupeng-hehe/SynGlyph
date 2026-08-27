#!/usr/bin/env python3
"""
Join single-letter color annotations (Lab) with saved glyph-graph exports (API).

Prerequisites:
  - API running (SYNGLYPH_API_URL or --api-base), e.g. http://localhost:8000
  - Dataset with 26 single-letter stimuli a–z, each annotated once
  - Graph payloads saved via /glyph-graph (Graph lab → Save) for letters you want structure for

Outputs (CSV):
  - letter_colors.csv
  - letter_graph_features_wide.csv  (mean-pooled segment features + graph-level stats)
  - letter_joint.csv                (merge on char)

Usage:
  export SYNGLYPH_API_URL=http://localhost:8000
  python build_joint_table.py --dataset-id YOUR_DATASET_UUID --output-dir ./exports
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

STRUCT_PREFIX = "struct_"


def _get(base: str, path: str, params: dict | None = None) -> Any:
    url = f"{base.rstrip('/')}{path}"
    r = requests.get(url, params=params or {}, timeout=120)
    r.raise_for_status()
    return r.json()


def _is_lowercase_letter(s: str) -> bool:
    return len(s) == 1 and "a" <= s <= "z"


def _extract_color_from_annotation(ann: dict[str, Any]) -> tuple[float, float, float] | None:
    spans = ann.get("spans") or []
    if not spans:
        return None
    # Single-letter stimuli: first span holds the letter color
    lab = spans[0].get("color_lab")
    if not lab or len(lab) != 3:
        return None
    return float(lab[0]), float(lab[1]), float(lab[2])


def _mean_pool_segments(payload: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    gh = payload.get("gnnHint") or {}
    keys = gh.get("segmentFeatureKeys") or []
    mat = gh.get("segmentFeatureMatrix") or []
    if keys and mat:
        arr = np.asarray(mat, dtype=float)
        if arr.size == 0:
            for k in keys:
                out[f"{STRUCT_PREFIX}mean_{k}"] = float("nan")
        else:
            m = np.nanmean(arr, axis=0)
            for i, k in enumerate(keys):
                out[f"{STRUCT_PREFIX}mean_{k}"] = float(m[i]) if i < len(m) else float("nan")
    proc = payload.get("processing") or {}
    for k, v in proc.items():
        if isinstance(v, (int, float)):
            out[f"{STRUCT_PREFIX}graph_{k}"] = float(v)
    anch = payload.get("anchors") or {}
    c = anch.get("centroidNorm")
    if isinstance(c, (list, tuple)) and len(c) == 2:
        out[f"{STRUCT_PREFIX}anchor_centroid_x"] = float(c[0])
        out[f"{STRUCT_PREFIX}anchor_centroid_y"] = float(c[1])
    bb = anch.get("bboxNorm")
    if isinstance(bb, dict):
        for bk in ("minX", "minY", "maxX", "maxY"):
            if bk in bb:
                out[f"{STRUCT_PREFIX}bbox_{bk}"] = float(bb[bk])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Build letter color + graph joint tables via API")
    ap.add_argument(
        "--api-base",
        default=os.environ.get("SYNGLYPH_API_URL", "http://localhost:8000"),
        help="API base URL",
    )
    ap.add_argument(
        "--dataset-id",
        default=os.environ.get("SYNGLYPH_DATASET_ID"),
        help="Dataset UUID (required for scoped raw-export)",
    )
    ap.add_argument(
        "--output-dir",
        type=Path,
        default=Path("exports/letter_joint"),
        help="Directory for CSV outputs",
    )
    args = ap.parse_args()
    base = args.api_base.rstrip("/")
    if not args.dataset_id:
        print("Error: pass --dataset-id or set SYNGLYPH_DATASET_ID", file=sys.stderr)
        sys.exit(1)

    raw = _get(base, "/api/stimuli/raw-export", {"dataset_id": args.dataset_id})
    stimuli = raw.get("stimuli") or []
    annotated: dict[str, Any] = raw.get("annotated") or {}

    color_rows: list[dict[str, Any]] = []
    for s in stimuli:
        text = (s.get("text") or "").strip()
        if len(text) != 1:
            continue
        ch = text.lower()
        if not _is_lowercase_letter(ch):
            continue
        sid = s.get("id")
        ann = annotated.get(sid)
        if not ann:
            continue
        lab = _extract_color_from_annotation(ann)
        if lab is None:
            continue
        color_rows.append(
            {
                "char": ch,
                "stimulus_id": sid,
                "L": lab[0],
                "a": lab[1],
                "b": lab[2],
            }
        )

    df_color = pd.DataFrame(color_rows).drop_duplicates(subset=["char"], keep="first")
    df_color = df_color.sort_values("char").reset_index(drop=True)

    # Graph payloads (must be saved from Graph lab beforehand)
    try:
        graphs = _get(base, "/api/glyph-graphs/export/all")
    except requests.HTTPError as e:
        print(f"Warning: could not fetch glyph graphs ({e}). Structure columns will be empty.", file=sys.stderr)
        graphs = []

    graph_by_char: dict[str, dict[str, Any]] = {}
    if isinstance(graphs, list):
        for g in graphs:
            c = (g.get("char") or "").lower().strip()
            if _is_lowercase_letter(c):
                graph_by_char[c] = g

    struct_rows: list[dict[str, Any]] = []
    for ch in sorted(graph_by_char.keys()):
        feats = _mean_pool_segments(graph_by_char[ch])
        feats["char"] = ch
        struct_rows.append(feats)

    df_struct = pd.DataFrame(struct_rows)
    if not df_struct.empty and "char" in df_struct.columns:
        df_struct = df_struct.sort_values("char").reset_index(drop=True)

    if df_color.empty:
        print("No single-letter annotated rows found. Check dataset-id and annotations.", file=sys.stderr)
    else:
        letters = set(df_color["char"])
        missing_g = letters - set(graph_by_char.keys())
        if missing_g:
            print(
                f"Note: {len(missing_g)} letters have color but no saved graph yet: "
                f"{''.join(sorted(missing_g))}. Save from /glyph-graph for full structure columns.",
                file=sys.stderr,
            )

    df_joint = df_color.merge(df_struct, on="char", how="left") if not df_struct.empty else df_color.copy()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    p_color = args.output_dir / "letter_colors.csv"
    p_struct = args.output_dir / "letter_graph_features_wide.csv"
    p_joint = args.output_dir / "letter_joint.csv"

    df_color.to_csv(p_color, index=False)
    if not df_struct.empty:
        df_struct.to_csv(p_struct, index=False)
    df_joint.to_csv(p_joint, index=False)

    # Sidecar JSON for reproducibility
    meta = {
        "api_base": base,
        "dataset_id": args.dataset_id,
        "n_color_rows": len(df_color),
        "n_graph_payloads": len(graph_by_char),
        "chars_color": sorted(df_color["char"].tolist()) if len(df_color) else [],
        "chars_graph": sorted(graph_by_char.keys()),
    }
    (args.output_dir / "export_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"Wrote {p_color} ({len(df_color)} rows)")
    print(f"Wrote {p_struct} ({len(df_struct)} rows)" if not df_struct.empty else "No graph features to write")
    print(f"Wrote {p_joint} ({len(df_joint)} rows)")
    print(f"Wrote {args.output_dir / 'export_meta.json'}")


if __name__ == "__main__":
    main()
