"""Phase 2: canonical model_family and forward shapes."""

import torch

from letter_sequence.models.model_factory import build_model, normalize_model_family


def test_normalize_legacy_alias():
    assert normalize_model_family("letter_sequence_bilstm") == "bilstm"
    assert normalize_model_family(None) == "bilstm"


def test_forward_shapes_all_families():
    x = torch.randint(0, 28, (2, 6))
    mask = torch.ones(2, 6)
    for fam in ("bilstm", "mlp", "transformer_encoder"):
        m = build_model(
            {
                "model_family": fam,
                "emb_dim": 32,
                "hidden": 16,
                "hidden_dim": 32,
                "num_layers": 1,
                "ff_dim": 64,
                "nhead": 4,
                "max_len": 32,
                "pos_dim": 8,
            }
        )
        o = m(x, mask)
        assert o["pred_lab"].shape == (2, 6, 3)
        assert o["pred_boundary"].shape == (2, 5)
