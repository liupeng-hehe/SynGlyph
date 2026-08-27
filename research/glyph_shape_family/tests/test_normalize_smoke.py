import numpy as np

from glyph_shape_family.features_core import extract_features
from glyph_shape_family.normalize import normalize_canvas


def test_normalize_and_features_smoke():
    m = np.zeros((20, 20), dtype=bool)
    m[5:15, 10] = True
    norm, meta = normalize_canvas(m, ref_height=32, canvas=(32, 32))
    meta.extra["full_mask"] = m
    d = extract_features(norm, meta, profile_bins=8)
    assert d["num_loops"] == 0.0
    assert d["num_components"] == 1.0
