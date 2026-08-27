#!/usr/bin/env python3
"""
Lightweight EDA on letter_joint.csv:
  - Standardize struct_* columns, PCA 2D
  - Scatter: PCA colored by hue derived from Lab
  - Mantel-style check: correlate pairwise struct distance vs Delta E (Lab)

Usage:
  python run_eda.py --joint-csv ./exports/letter_joint.csv --output-dir ./exports/eda
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import colors as mcolors
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

try:
    from skimage.color import lab2rgb
except ImportError:
    lab2rgb = None


def _lab_row_to_rgb(l: float, a: float, b: float) -> tuple[float, float, float]:
    if lab2rgb is None:
        # fallback: map L to grayscale
        g = max(0.0, min(1.0, l / 100.0))
        return g, g, g
    lab = np.array([[[l, a, b]]], dtype=float)
    rgb = lab2rgb(lab)[0, 0]
    return float(rgb[0]), float(rgb[1]), float(rgb[2])


def _delta_e76(lab1: np.ndarray, lab2: np.ndarray) -> float:
    return float(np.linalg.norm(lab1 - lab2))


def main() -> None:
    ap = argparse.ArgumentParser(description="EDA: structure vs color on letter_joint.csv")
    ap.add_argument("--joint-csv", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path("exports/eda"))
    ap.add_argument("--random-state", type=int, default=42)
    args = ap.parse_args()

    df = pd.read_csv(args.joint_csv)
    if df.empty:
        print("Empty CSV", file=sys.stderr)
        sys.exit(1)

    struct_cols = [c for c in df.columns if c.startswith("struct_")]
    if len(struct_cols) < 1:
        print(
            "No struct_* columns. Run build_joint_table.py after saving graphs from /glyph-graph.",
            file=sys.stderr,
        )
        if "L" not in df.columns:
            sys.exit(1)

    args.output_dir.mkdir(parents=True, exist_ok=True)

    # --- PCA on structure ---
    if len(struct_cols) >= 1 and len(df) >= 2:
        X = df[struct_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0).values
        n_comp = min(2, X.shape[1], max(1, X.shape[0] - 1))
        Xs = StandardScaler().fit_transform(X)
        pca = PCA(n_components=n_comp, random_state=args.random_state)
        xy = pca.fit_transform(Xs)
        df["pca1"] = xy[:, 0]
        df["pca2"] = xy[:, 1] if xy.shape[1] > 1 else 0.0

        fig, ax = plt.subplots(figsize=(8, 6), dpi=120)
        if all(c in df.columns for c in ("L", "a", "b")):
            rgbs = [_lab_row_to_rgb(float(r["L"]), float(r["a"]), float(r["b"])) for _, r in df.iterrows()]
            for i, (_, row) in enumerate(df.iterrows()):
                ax.scatter(
                    row["pca1"],
                    row["pca2"],
                    c=[rgbs[i]],
                    s=120,
                    edgecolors="white",
                    linewidths=0.5,
                )
                ax.annotate(
                    str(row["char"]),
                    (row["pca1"], row["pca2"]),
                    fontsize=8,
                    ha="center",
                    va="center",
                    color="white" if sum(rgbs[i]) < 1.2 else "black",
                )
        else:
            ax.scatter(df["pca1"], df["pca2"])
        ev = pca.explained_variance_ratio_
        ax.set_xlabel(f"PC1 ({ev[0] * 100:.1f}%)")
        ax.set_ylabel(f"PC2 ({ev[1] * 100:.1f}%)" if len(ev) > 1 else "PC2 (n/a)")
        ax.set_title("Letter structure PCA (colors = Lab→RGB)")
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        p_pca = args.output_dir / "structure_pca.png"
        fig.savefig(p_pca)
        plt.close(fig)
        print(f"Wrote {p_pca}")

    # --- Lab scatter ---
    if all(c in df.columns for c in ("L", "a", "b")):
        fig, ax = plt.subplots(figsize=(6, 6), dpi=120)
        if "pca1" in df.columns and len(struct_cols) >= 1:
            cnorm = mcolors.Normalize(vmin=df["pca1"].min(), vmax=df["pca1"].max())
            cmap = plt.cm.viridis
            for _, row in df.iterrows():
                ax.scatter(
                    row["a"],
                    row["b"],
                    c=[cmap(cnorm(row["pca1"]))],
                    s=100,
                    edgecolors="k",
                    linewidths=0.3,
                )
                ax.annotate(str(row["char"]), (row["a"], row["b"]), fontsize=8)
        else:
            ax.scatter(df["a"], df["b"])
            for _, row in df.iterrows():
                ax.annotate(str(row["char"]), (row["a"], row["b"]), fontsize=8)
        ax.set_xlabel("a*")
        ax.set_ylabel("b*")
        ax.set_title("Lab (a vs b), annotations")
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        p_lab = args.output_dir / "lab_ab_scatter.png"
        fig.savefig(p_lab)
        plt.close(fig)
        print(f"Wrote {p_lab}")

    # --- Distance correlation (needs at least 4 points) ---
    n = len(df)
    if n >= 4 and len(struct_cols) >= 1 and all(c in df.columns for c in ("L", "a", "b")):
        X = df[struct_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0).values
        Xs = StandardScaler().fit_transform(X)
        labs = df[["L", "a", "b"]].values.astype(float)
        ds: list[float] = []
        dc: list[float] = []
        for i in range(n):
            for j in range(i + 1, n):
                ds.append(float(np.linalg.norm(Xs[i] - Xs[j])))
                dc.append(_delta_e76(labs[i], labs[j]))
        ds_arr = np.asarray(ds)
        dc_arr = np.asarray(dc)
        if np.std(ds_arr) > 1e-12 and np.std(dc_arr) > 1e-12:
            r = np.corrcoef(ds_arr, dc_arr)[0, 1]
            print(f"Pairwise correlation (struct L2 vs ΔE76): r = {r:.4f} (n_pairs={len(ds)})")
            perm_path = args.output_dir / "distance_correlation.txt"
            perm_path.write_text(
                f"struct_vs_deltaE76_r={r:.6f}\nn_pairs={len(ds)}\n",
                encoding="utf-8",
            )
            print(f"Wrote {perm_path}")
        else:
            print("Skipping distance correlation (zero variance).")


if __name__ == "__main__":
    main()
