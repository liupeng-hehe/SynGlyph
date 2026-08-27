import pandas as pd

from glyph_shape_family.integrations.letter_priors_client import (
    letter_priors_to_color_clusters,
    merge_features_with_color_clusters,
)


def test_letter_priors_to_color_clusters():
    priors = {
        "a": {"avg_l": 10.0, "avg_a": 0.0, "avg_b": 0.0, "count": 5},
        "b": {"avg_l": 90.0, "avg_a": 0.0, "avg_b": 0.0, "count": 5},
    }
    tab, meta = letter_priors_to_color_clusters(priors, n_clusters=2, random_state=0)
    assert meta["n_clusters_effective"] == 2
    assert "color_cluster" in tab.columns


def test_merge_features():
    priors = {
        "a": {"avg_l": 10.0, "avg_a": 0.0, "avg_b": 0.0, "count": 5},
        "b": {"avg_l": 90.0, "avg_a": 0.0, "avg_b": 0.0, "count": 5},
    }
    tab, _ = letter_priors_to_color_clusters(priors, n_clusters=2, random_state=0)
    feat = pd.DataFrame({"glyph_label": ["a", "b"], "f1": [1.0, 2.0], "source_path": ["x", "y"]})
    m = merge_features_with_color_clusters(feat, tab)
    assert len(m) == 2
    assert "color_cluster" in m.columns
