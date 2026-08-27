#!/usr/bin/env python3
"""Extract shape features from a directory of PNG skeletons → CSV (+ optional JSONL meta)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

# allow running without install
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from glyph_shape_family.feature_modes import apply_feature_mode
from glyph_shape_family.features_core import (
    PROFILE_BINS_DEFAULT,
    extract_features,
    feature_dict_to_row,
)
from glyph_shape_family.io import load_skeleton_mask
from glyph_shape_family.normalize import normalize_canvas


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input_dir", type=Path, help="Directory containing PNG files")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("features.csv"),
        help="Output CSV path",
    )
    p.add_argument(
        "--mode",
        choices=("family", "full", "raw"),
        default="raw",
        help="raw: all columns; family/full: subset for UMAP downstream",
    )
    p.add_argument(
        "--fold-vprof",
        action="store_true",
        help="Fold symmetric vprof bins (use with family mode when post-processing)",
    )
    p.add_argument(
        "--label-regex",
        type=str,
        default=r"^(?P<label>[a-z])(?:_.*)?\.png$",
        help="Regex with named group 'label' for glyph label from filename",
    )
    p.add_argument("--ref-height", type=int, default=64)
    p.add_argument("--canvas-h", type=int, default=None, help="Fixed canvas height (default: ref-height)")
    p.add_argument("--canvas-w", type=int, default=None, help="Fixed canvas width (default: ref-height)")
    p.add_argument("--profile-bins", type=int, default=PROFILE_BINS_DEFAULT)
    p.add_argument("--meta-jsonl", type=Path, default=None, help="Append one JSON meta line per image")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    rx = re.compile(args.label_regex, re.IGNORECASE)
    paths = sorted(args.input_dir.glob("*.png"))
    if not paths:
        print(f"No PNG files in {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    ch = args.canvas_h or args.ref_height
    cw = args.canvas_w or args.ref_height
    canvas = (ch, cw)

    rows: list[dict] = []
    meta_f = args.meta_jsonl.open("w", encoding="utf-8") if args.meta_jsonl else None

    for path in paths:
        raw = load_skeleton_mask(str(path))
        norm, meta = normalize_canvas(raw, ref_height=args.ref_height, canvas=canvas)
        meta.extra["full_mask"] = raw
        meta.extra["source_path"] = str(path.resolve())

        feats = extract_features(norm, meta, profile_bins=args.profile_bins)
        row = feature_dict_to_row(feats, profile_bins=args.profile_bins)
        m = rx.search(path.name)
        label = m.group("label").lower() if m else path.stem
        row["glyph_label"] = label
        row["source_path"] = str(path.resolve())
        rows.append(row)

        if meta_f:
            meta_line = {
                "source_path": row["source_path"],
                "glyph_label": label,
                "normalize": {
                    "ref_height": meta.ref_height,
                    "canvas_hw": meta.canvas_hw,
                    "scale": meta.scale,
                    "heuristic_baseline": meta.heuristic_baseline,
                    "crop_bbox": meta.crop_bbox,
                },
            }
            meta_f.write(json.dumps(meta_line) + "\n")

    if meta_f:
        meta_f.close()

    df = pd.DataFrame(rows)
    meta_cols = {"glyph_label", "source_path"}
    feat_only = [c for c in df.columns if c not in meta_cols]
    if args.mode in ("family", "full"):
        num = apply_feature_mode(
            df[feat_only],
            args.mode,
            profile_bins=args.profile_bins,
            fold_vprof=args.fold_vprof,
        )
        df_out = pd.concat([df[["glyph_label", "source_path"]], num], axis=1)
    else:
        df_out = df

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(args.output, index=False)
    print(f"Wrote {len(df_out)} rows to {args.output}")


if __name__ == "__main__":
    main()
