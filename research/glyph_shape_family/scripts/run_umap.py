#!/usr/bin/env python3
"""Read features.csv → scale → UMAP → cluster → embedding.csv + PNG."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.impute import SimpleImputer
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

try:
    from umap import UMAP
except ImportError:
    UMAP = None

try:
    import hdbscan
except ImportError:
    hdbscan = None

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("features_csv", type=Path)
    p.add_argument("-o", "--output-dir", type=Path, default=Path("umap_out"))
    p.add_argument("--prefix", type=str, default="run")
    p.add_argument("--random-state", type=int, default=42)
    p.add_argument("--n-neighbors", type=int, default=15)
    p.add_argument("--min-dist", type=float, default=0.1)
    p.add_argument(
        "--cluster",
        choices=("hdbscan", "kmeans", "none"),
        default="kmeans",
        help="hdbscan requires: pip install glyph-shape-family[cluster]",
    )
    p.add_argument("--kmeans-k", type=int, default=10)
    p.add_argument("--hdbscan-min-cluster-size", type=int, default=5)
    p.add_argument(
        "--color-csv",
        type=Path,
        default=None,
        help="Optional CSV with id/source_path join for future color overlay (not used in fit)",
    )
    p.add_argument(
        "--embedder",
        choices=("umap", "pca", "tsne"),
        default="pca",
        help="2D embedding: umap needs pip install -e \".[umap]\" (falls back to pca if missing)",
    )
    return p.parse_args()


def feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    drop = {"glyph_label", "source_path", "id", "umap_x", "umap_y", "cluster_id"}
    cols = [c for c in df.columns if c not in drop]
    # numeric only
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    return df[num_cols], num_cols


def main() -> None:
    args = parse_args()
    df = pd.read_csv(args.features_csv)
    X_df, cols = feature_matrix(df)
    if not cols:
        print("No numeric feature columns found", file=sys.stderr)
        sys.exit(1)

    imp = SimpleImputer(strategy="constant", fill_value=0.0)
    X = imp.fit_transform(X_df.values)
    Xs = StandardScaler().fit_transform(X)

    want = args.embedder
    if want == "umap" and UMAP is None:
        print("umap-learn not installed; falling back to PCA (pip install -e \".[umap]\")", file=sys.stderr)
        want = "pca"

    if want == "umap":
        emb = UMAP(
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            metric="euclidean",
            random_state=args.random_state,
        ).fit_transform(Xs)
        used_embed = "umap"
    elif want == "tsne":
        emb = TSNE(
            n_components=2,
            random_state=args.random_state,
            perplexity=min(30, max(5, (len(Xs) - 1) // 3)),
        ).fit_transform(Xs)
        used_embed = "tsne"
    else:
        emb = PCA(n_components=2, random_state=args.random_state).fit_transform(Xs)
        used_embed = "pca"

    out = df.copy()
    out["umap_x"] = emb[:, 0]
    out["umap_y"] = emb[:, 1]

    if args.cluster == "hdbscan":
        if hdbscan is None:
            print("hdbscan not installed; falling back to kmeans", file=sys.stderr)
            km = KMeans(n_clusters=args.kmeans_k, random_state=args.random_state, n_init=10)
            out["cluster_id"] = km.fit_predict(emb)
        else:
            cl = hdbscan.HDBSCAN(min_cluster_size=args.hdbscan_min_cluster_size)
            out["cluster_id"] = cl.fit_predict(emb)
    elif args.cluster == "kmeans":
        km = KMeans(n_clusters=args.kmeans_k, random_state=args.random_state, n_init=10)
        out["cluster_id"] = km.fit_predict(emb)
    else:
        out["cluster_id"] = -1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    pref = args.prefix
    emb_path = args.output_dir / f"{pref}_embedding.csv"
    out.to_csv(emb_path, index=False)

    fig, ax = plt.subplots(figsize=(10, 8))
    if "cluster_id" in out.columns and args.cluster != "none":
        sc = ax.scatter(out["umap_x"], out["umap_y"], c=out["cluster_id"], cmap="tab20", s=40, alpha=0.85)
        plt.colorbar(sc, ax=ax, label="cluster_id")
    else:
        ax.scatter(out["umap_x"], out["umap_y"], s=40, alpha=0.85)

    if "glyph_label" in out.columns:
        for _, r in out.iterrows():
            ax.annotate(
                str(r["glyph_label"]),
                (r["umap_x"], r["umap_y"]),
                fontsize=7,
                alpha=0.8,
                ha="center",
                va="bottom",
            )

    ax.set_xlabel(f"{used_embed.upper()}-1")
    ax.set_ylabel(f"{used_embed.upper()}-2")
    ax.set_title(f"Glyph skeleton shape ({used_embed.upper()})")
    fig.tight_layout()
    png_path = args.output_dir / f"{pref}_umap.png"
    fig.savefig(png_path, dpi=150)
    plt.close()

    # optional cluster summary
    if "cluster_id" in out.columns and "glyph_label" in out.columns:
        summ = (
            out.groupby(["cluster_id", "glyph_label"], dropna=False)
            .size()
            .reset_index(name="count")
        )
        summ.to_csv(args.output_dir / f"{pref}_cluster_summary.csv", index=False)

    print(f"Wrote {emb_path} and {png_path}")


if __name__ == "__main__":
    main()
