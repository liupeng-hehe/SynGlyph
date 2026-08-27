"""Uncertainty v1: boundary mean binary entropy."""

import torch

from letter_sequence.al.uncertainty import uncertainty_v1_boundary_entropy


def test_uncertainty_deterministic():
    torch.manual_seed(0)
    pb = torch.randn(4, 5)
    bm = torch.ones(4, 5)
    s1 = uncertainty_v1_boundary_entropy(pb, bm)
    s2 = uncertainty_v1_boundary_entropy(pb, bm)
    assert torch.allclose(s1, s2)
    assert s1.shape == (4,)


def test_masked_positions():
    pb = torch.zeros(2, 3)
    bm = torch.tensor([[1.0, 1.0, 0.0], [0.0, 0.0, 0.0]])
    s = uncertainty_v1_boundary_entropy(pb, bm)
    # max entropy ~0.693 at p=0.5; sigmoid(0)=0.5
    assert s[0] > 0.6 and s[1] == 0.0
