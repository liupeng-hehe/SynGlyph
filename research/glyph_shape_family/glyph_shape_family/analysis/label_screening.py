"""
Given a label column (e.g. color cluster id), score which numeric features
align with label separation: RF importance, permutation MI, ANOVA F, Kruskal-Wallis.
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import f_classif, mutual_info_classif
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.preprocessing import LabelEncoder, StandardScaler


def _numeric_feature_matrix(
    df: pd.DataFrame,
    label_col: str,
    extra_exclude_columns: set[str] | None = None,
) -> tuple[pd.DataFrame, np.ndarray]:
    """Drop non-numeric and label; return X_df and y array (may be object)."""
    exclude = {
        label_col,
        "glyph_label",
        "source_path",
        "id",
        "umap_x",
        "umap_y",
        "cluster_id",
    }
    if extra_exclude_columns:
        exclude |= extra_exclude_columns
    cols = [c for c in df.columns if c not in exclude]
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    X_df = df[num_cols].copy()
    y = df[label_col].values
    return X_df, y


def screen_features_for_labels(
    df: pd.DataFrame,
    label_col: str,
    *,
    random_state: int = 42,
    n_rf_estimators: int = 200,
    n_permutation_repeats: int = 30,
    extra_exclude_columns: set[str] | None = None,
    n_jobs: int = 1,
) -> dict[str, Any]:
    """
    Fit a supervised model predicting ``label_col`` from numeric features and
    compute univariate association statistics.

    Returns a dict with DataFrames: ``rf_importance``, ``permutation``,
    ``mutual_information``, ``f_classif``, ``kruskal_wallis``, plus ``meta`` (n, classes).
    """
    X_df, y_raw = _numeric_feature_matrix(df, label_col, extra_exclude_columns)
    if X_df.shape[1] == 0:
        raise ValueError("No numeric feature columns after excluding label/metadata.")

    mask = pd.Series(y_raw).notna()
    if mask.sum() == 0:
        raise ValueError("No rows with non-null labels.")
    X_df = X_df.loc[mask].reset_index(drop=True)
    y_raw = y_raw[mask.values]

    # Encode labels
    le = LabelEncoder()
    y = le.fit_transform(np.asarray(y_raw).astype(str))
    n_classes = len(le.classes_)
    if n_classes < 2:
        raise ValueError("Need at least 2 distinct label values for screening.")

    # Stub features (e.g. has_crossbar) may be all-NaN; sklearn SimpleImputer drops those
    # columns by default → length mismatch with feature names. Fill all-NaN cols with 0.
    X_df = X_df.replace([np.inf, -np.inf], np.nan)
    for c in X_df.columns:
        if X_df[c].isna().all():
            X_df[c] = 0.0

    imputer = SimpleImputer(strategy="median")
    X_imp = imputer.fit_transform(X_df.values)
    names = list(X_df.columns)
    if X_imp.shape[1] != len(names):
        raise ValueError(
            f"Feature matrix shape {X_imp.shape} vs {len(names)} names after imputation; "
            "check sklearn version / SimpleImputer output."
        )

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X_imp)

    # --- Random Forest (importance + permutation on scaled features)
    rf = RandomForestClassifier(
        n_estimators=n_rf_estimators,
        random_state=random_state,
        class_weight="balanced_subsample",
        max_depth=12,
        min_samples_leaf=1,
        n_jobs=n_jobs,
    )
    rf.fit(Xs, y)

    imp_df = pd.DataFrame(
        {"feature": names, "rf_gini_importance": rf.feature_importances_}
    ).sort_values("rf_gini_importance", ascending=False)

    perm = permutation_importance(
        rf,
        Xs,
        y,
        n_repeats=n_permutation_repeats,
        random_state=random_state,
        n_jobs=n_jobs,
    )
    perm_df = pd.DataFrame(
        {
            "feature": names,
            "perm_importance_mean": perm.importances_mean,
            "perm_importance_std": perm.importances_std,
        }
    ).sort_values("perm_importance_mean", ascending=False)

    # Mutual information & F-test (use scaled imputed X)
    mi = mutual_info_classif(Xs, y, random_state=random_state)
    mi_df = pd.DataFrame({"feature": names, "mutual_information": mi}).sort_values(
        "mutual_information", ascending=False
    )

    # f_classif warns on near-constant columns (e.g. stub features); not a failure.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=UserWarning)
        warnings.simplefilter("ignore", category=RuntimeWarning)
        f_stat, f_p = f_classif(Xs, y)
    f_stat = np.asarray(f_stat, dtype=np.float64)
    f_p = np.asarray(f_p, dtype=np.float64)
    f_stat = np.nan_to_num(f_stat, nan=0.0, posinf=0.0, neginf=0.0)
    f_p = np.nan_to_num(f_p, nan=1.0, posinf=1.0, neginf=1.0)
    f_df = pd.DataFrame(
        {"feature": names, "f_statistic": f_stat, "f_pvalue": f_p}
    ).sort_values("f_statistic", ascending=False)

    # Kruskal-Wallis per feature across label groups (on raw imputed, not scaled)
    kw_rows = []
    for j, col in enumerate(names):
        groups = [X_imp[y == k, j] for k in range(n_classes)]
        groups = [g[~np.isnan(g)] for g in groups]
        groups = [g for g in groups if len(g) > 0]
        if len(groups) < 2:
            kw_rows.append({"feature": col, "kw_statistic": np.nan, "kw_pvalue": np.nan})
            continue
        try:
            stat, p = stats.kruskal(*groups)
        except ValueError:
            stat, p = np.nan, np.nan
        kw_rows.append({"feature": col, "kw_statistic": stat, "kw_pvalue": p})
    kw_df = pd.DataFrame(kw_rows).sort_values("kw_statistic", ascending=False)

    # Combined rank score (mean rank across methods, lower rank = more important)
    def rank_norm(series: pd.Series) -> pd.Series:
        n = len(series)
        if n <= 1:
            return pd.Series([0.5] * n, index=series.index)
        r = series.rank(ascending=False)
        return (n - r + 1) / n

    merged = imp_df[["feature", "rf_gini_importance"]].merge(
        perm_df[["feature", "perm_importance_mean"]], on="feature"
    )
    merged = merged.merge(mi_df, on="feature").merge(
        f_df[["feature", "f_statistic", "f_pvalue"]], on="feature"
    )
    merged = merged.merge(kw_df, on="feature")
    merged["rank_rf"] = rank_norm(merged["rf_gini_importance"])
    merged["rank_perm"] = rank_norm(merged["perm_importance_mean"])
    merged["rank_mi"] = rank_norm(merged["mutual_information"])
    merged["rank_f"] = rank_norm(merged["f_statistic"])
    merged["rank_kw"] = rank_norm(merged["kw_statistic"].fillna(0))
    merged["composite_score"] = (
        merged["rank_rf"]
        + merged["rank_perm"]
        + merged["rank_mi"]
        + merged["rank_f"]
        + merged["rank_kw"]
    ) / 5.0
    composite = merged.sort_values("composite_score", ascending=False)

    meta = {
        "n_samples": int(len(y)),
        "n_features": len(names),
        "n_classes": n_classes,
        "class_names": list(le.classes_),
    }

    return {
        "rf_importance": imp_df,
        "permutation": perm_df,
        "mutual_information": mi_df,
        "f_classif": f_df,
        "kruskal_wallis": kw_df,
        "composite": composite,
        "meta": meta,
    }
