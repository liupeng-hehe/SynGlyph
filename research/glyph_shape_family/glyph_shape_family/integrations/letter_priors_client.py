"""
Fetch aggregated per-letter LAB colors from SynGlyph API (GET /api/letter-priors).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans


def fetch_letter_priors(
    api_base: str,
    *,
    dataset_ids: Optional[str] = None,
    timeout_s: float = 60.0,
) -> dict[str, Any]:
    """
    Returns JSON like ``{"a": {"avg_l", "avg_a", "avg_b", "count", ...}, ...}``.
    Letter keys follow DB (often lowercase for English spans).
    """
    base = api_base.rstrip("/")
    url = f"{base}/api/letter-priors"
    if dataset_ids:
        q = urllib.parse.urlencode({"dataset_ids": dataset_ids})
        url = f"{url}?{q}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Failed to fetch letter priors from {url!r}: {e}\n"
            f"Start the API (e.g. pnpm dev:api) or set SYNGLYPH_API_URL."
        ) from e
    return json.loads(raw)


def default_api_base() -> str:
    return os.environ.get("SYNGLYPH_API_URL", "http://127.0.0.1:8000").rstrip("/")


def letter_priors_to_color_clusters(
    priors: dict[str, Any],
    *,
    n_clusters: int = 8,
    random_state: int = 42,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    K-means on (avg_l, avg_a, avg_b) per letter → integer ``color_cluster``.

    Returns:
      - DataFrame with index lowercase letter, columns color_cluster, avg_l, avg_a, avg_b, count
      - meta dict with n_letters, n_clusters_effective
    """
    rows = []
    for ch, v in priors.items():
        if not isinstance(v, dict):
            continue
        c = str(ch).lower()
        if len(c) != 1 or not c.isalpha():
            continue
        rows.append(
            {
                "letter": c,
                "avg_l": float(v.get("avg_l", 50.0)),
                "avg_a": float(v.get("avg_a", 0.0)),
                "avg_b": float(v.get("avg_b", 0.0)),
                "count": int(v.get("count", 0)),
            }
        )
    if len(rows) < 2:
        raise ValueError(
            "Letter priors contain fewer than 2 letters with color data. "
            "Annotate single-letter spans in the app or check dataset_ids / API."
        )
    df = pd.DataFrame(rows).drop_duplicates(subset=["letter"], keep="last")
    X = df[["avg_l", "avg_a", "avg_b"]].values
    n = len(df)
    k_eff = max(2, min(int(n_clusters), n))
    km = KMeans(n_clusters=k_eff, random_state=random_state, n_init=10)
    df["color_cluster"] = km.fit_predict(X)
    df = df.set_index("letter")
    meta = {"n_letters": n, "n_clusters_effective": k_eff, "requested_clusters": int(n_clusters)}
    return df, meta


def merge_features_with_color_clusters(
    features: pd.DataFrame,
    letter_table: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join API priors onto ``glyph_label`` (first lowercase letter).
    Adds ``color_cluster`` and renamed LAB columns (for audit only — exclude from X when screening).
    """
    if "glyph_label" not in features.columns:
        raise ValueError("features CSV must contain glyph_label")
    t = letter_table.reset_index()
    if "letter" not in t.columns:
        raise ValueError("letter_table must be indexed by letter")
    feat = features.copy()
    feat["_letter"] = feat["glyph_label"].astype(str).str.lower().str.slice(0, 1)
    merged = feat.merge(t, left_on="_letter", right_on="letter", how="inner")
    merged = merged.drop(columns=["_letter", "letter"], errors="ignore")
    merged = merged.rename(
        columns={
            "avg_l": "color_prior_avg_l",
            "avg_a": "color_prior_avg_a",
            "avg_b": "color_prior_avg_b",
            "count": "prior_span_count",
        }
    )
    return merged


# Columns that would leak LAB into supervised screening (cluster was fit on LAB).
LAB_LEAK_COLUMNS = frozenset(
    {"color_prior_avg_l", "color_prior_avg_a", "color_prior_avg_b", "prior_span_count"}
)
