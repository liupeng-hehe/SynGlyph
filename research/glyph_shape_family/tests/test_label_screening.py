import pandas as pd

from glyph_shape_family.analysis.label_screening import screen_features_for_labels


def test_screen_features_for_labels_smoke():
    df = pd.DataFrame(
        {
            "f1": [0.0, 0.1, 5.0, 5.1],
            "f2": [1.0, 1.0, 1.0, 1.0],
            "lab": ["a", "a", "b", "b"],
        }
    )
    out = screen_features_for_labels(df, "lab", n_rf_estimators=10, n_permutation_repeats=5)
    assert len(out["composite"]) == 2
    assert out["meta"]["n_classes"] == 2
    top = out["composite"].iloc[0]["feature"]
    assert top in ("f1", "f2")


def test_all_nan_stub_column_does_not_crash():
    """Like batch-2 NaN stubs: entire column missing → was dropped by imputer, broke RF length."""
    df = pd.DataFrame(
        {
            "f1": [0.0, 0.1, 5.0, 5.1],
            "stub_all_nan": [float("nan")] * 4,
            "lab": ["a", "a", "b", "b"],
        }
    )
    out = screen_features_for_labels(df, "lab", n_rf_estimators=10, n_permutation_repeats=5)
    assert len(out["composite"]) == 2
