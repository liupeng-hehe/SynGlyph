"""Batch boundary + segment-attribute uncertainty (matches API hybrid predictions)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import torch
    from torch import nn


def _attribute_uncertainty_proxy(pred_prom, pred_spread, letter_mask):
    import torch

    p_prom = torch.clamp(pred_prom, 0.0, 1.0)
    p_spread = torch.clamp(pred_spread, 0.0, 1.0)
    prom_unc = 1.0 - torch.abs(2.0 * p_prom - 1.0)
    spread_unc = 1.0 - torch.abs(2.0 * p_spread - 1.0)
    mean_unc = 0.5 * (prom_unc + spread_unc)
    denom = letter_mask.sum(dim=1).clamp(min=1e-6)
    return (mean_unc * letter_mask).sum(dim=1) / denom


def batch_uncertainty_for_texts(
    model: "nn.Module",
    texts: list[str],
    *,
    device: "torch.device",
    batch_size: int = 64,
) -> list[tuple[float, float]]:
    """
    Return (boundary_uncertainty, segment_attribute_uncertainty) per text,
    matching ``score_candidate_stimuli`` / hybrid online behavior.
    """
    import torch
    from letter_sequence.al.uncertainty import uncertainty_v1_boundary_entropy
    from letter_sequence.data.sequence_dataset import collate_letter_batch, forward_letter_batch

    out: list[tuple[float, float]] = []
    model.eval()
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        rows = []
        lens: list[int] = []
        for text in chunk:
            letters = list((text or "").lower())
            L = max(1, len(letters))
            if not letters:
                letters = [" "]
            lens.append(len(text or ""))
            rows.append(
                {
                    "letters": letters,
                    "target_lab": [[0.0, 0.0, 0.0] for _ in range(L)],
                    "target_prominence": [0.0 for _ in range(L)],
                    "target_spread": [0.0 for _ in range(L)],
                    "target_boundary": [0.0 for _ in range(max(0, L - 1))],
                }
            )
        batch = collate_letter_batch(rows)
        for k, v in batch.items():
            if isinstance(v, torch.Tensor):
                batch[k] = v.to(device)
        with torch.no_grad():
            pred = forward_letter_batch(model, batch)
            b_unc = uncertainty_v1_boundary_entropy(pred["pred_boundary"], batch["boundary_mask"])
            a_unc = _attribute_uncertainty_proxy(
                pred["pred_prominence"], pred["pred_spread"], batch["letter_mask"]
            )
        b_vals = b_unc.cpu().tolist()
        a_vals = a_unc.cpu().tolist()
        for b_v, a_v, original_len in zip(b_vals, a_vals, lens):
            boundary_val = float(b_v) if original_len > 1 else 0.0
            out.append((max(0.0, boundary_val), max(0.0, float(a_v))))
    return out
