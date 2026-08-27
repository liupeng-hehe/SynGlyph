"""
Uncertainty scoring for active learning.

Phase 2 v1: only ``uncertainty_v1_boundary_entropy`` — mean binary entropy over valid boundary positions.
TODO: MC dropout, ensemble, prom/spread ablations.
"""

from __future__ import annotations

import torch


def binary_entropy(p: torch.Tensor) -> torch.Tensor:
    """Element-wise H(p) for Bernoulli; p in (0,1)."""
    p = p.clamp(1e-7, 1.0 - 1e-7)
    return -(p * torch.log(p) + (1 - p) * torch.log(1 - p))


def uncertainty_v1_boundary_entropy(
    pred_boundary: torch.Tensor,
    boundary_mask: torch.Tensor,
) -> torch.Tensor:
    """
    Per-example scores [B]: mean binary entropy at valid boundary positions.

    ``pred_boundary``: [B, T-1] logits or pre-sigmoid values (we apply sigmoid).
    ``boundary_mask``: [B, T-1] 1 = valid boundary position.
    """
    if pred_boundary.numel() == 0:
        return torch.zeros(pred_boundary.shape[0], device=pred_boundary.device, dtype=pred_boundary.dtype)
    p = torch.sigmoid(pred_boundary)
    ent = binary_entropy(p)
    m = boundary_mask
    denom = m.sum(dim=1).clamp(min=1e-6)
    return (ent * m).sum(dim=1) / denom


def uncertainty_scores_batch(
    model: torch.nn.Module,
    batch: dict[str, torch.Tensor],
    device: torch.device,
    version: str = "uncertainty_v1_boundary_entropy",
) -> torch.Tensor:
    """Return [B] scores for each example in batch."""
    for k in batch:
        if isinstance(batch[k], torch.Tensor):
            batch[k] = batch[k].to(device)
    from letter_sequence.data.sequence_dataset import forward_letter_batch

    pred = forward_letter_batch(model, batch)
    pb = pred["pred_boundary"]
    bm = batch["boundary_mask"]
    if version != "uncertainty_v1_boundary_entropy":
        raise ValueError(f"unknown uncertainty version: {version}")
    return uncertainty_v1_boundary_entropy(pb, bm)


# Backward-compatible stub name
def placeholder_uncertainty(pred: dict) -> dict[str, float]:
    """Deprecated; use uncertainty_v1_boundary_entropy."""
    return {"word_uncertainty": 0.0, "letter_max_uncertainty": 0.0, "boundary_max_uncertainty": 0.0}
