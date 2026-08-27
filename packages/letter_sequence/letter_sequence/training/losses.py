"""Multi-task masked losses."""

from __future__ import annotations

from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F


def multitask_loss(
    pred: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
    weights: dict[str, float],
    lab_criterion: nn.Module | None = None,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    """
    pred: pred_lab [B,T,3], pred_prominence [B,T], pred_spread [B,T], pred_boundary [B,T-1]
    batch: letter_mask [B,T], boundary_mask [B,T-1], targets
    """
    if lab_criterion is None:
        lab_criterion = nn.SmoothL1Loss(reduction="none")

    lm = batch["letter_mask"]
    bm = batch["boundary_mask"]

    # Lab: [B,T,3]
    diff_lab = lab_criterion(pred["pred_lab"], batch["target_lab"])  # [B,T,3]
    loss_lab = (diff_lab.mean(dim=-1) * lm).sum() / lm.sum().clamp(min=1e-6)

    mse_prom = F.smooth_l1_loss(pred["pred_prominence"], batch["target_prominence"], reduction="none")
    loss_prom = (mse_prom * lm).sum() / lm.sum().clamp(min=1e-6)

    mse_spr = F.smooth_l1_loss(pred["pred_spread"], batch["target_spread"], reduction="none")
    loss_spr = (mse_spr * lm).sum() / lm.sum().clamp(min=1e-6)

    pb = pred["pred_boundary"]
    tb = batch["target_boundary"]
    if pb.numel() == 0 or bm.sum() == 0:
        loss_b = torch.tensor(0.0, device=lm.device, dtype=lm.dtype)
    else:
        mse_b = F.smooth_l1_loss(pb, tb, reduction="none")
        loss_b = (mse_b * bm).sum() / bm.sum().clamp(min=1e-6)

    loss_d = torch.tensor(0.0, device=lm.device, dtype=lm.dtype)
    if "pred_dominant_logits" in pred and "dominant_mask" in batch and batch["dominant_mask"].sum() > 0:
        plog = pred["pred_dominant_logits"]  # [B,T]
        tidx = batch["target_dominant"].long()  # [B]
        dm = batch["dominant_mask"] > 0.5
        if dm.any():
            bi = torch.nonzero(dm, as_tuple=False).squeeze(-1)
            loss_d = F.cross_entropy(plog[bi], tidx[bi], reduction="mean")

    loss_wl = torch.tensor(0.0, device=lm.device, dtype=lm.dtype)
    if "pred_word_lab" in pred and "word_lab_mask" in batch and batch["word_lab_mask"].sum() > 0:
        pwl = pred["pred_word_lab"]
        twl = batch["target_word_lab"]  # [B,3]
        wm = batch["word_lab_mask"]  # [B]
        diff = lab_criterion(pwl, twl).mean(dim=-1)  # [B]
        loss_wl = (diff * wm).sum() / wm.sum().clamp(min=1e-6)

    loss_sprp = torch.tensor(0.0, device=lm.device, dtype=lm.dtype)
    if "pred_spread_pair" in pred and "spread_pair_mask" in batch:
        sbm = batch["spread_pair_mask"]
        if sbm.sum() > 0:
            tspp = batch["target_spread_pair"]
            pspp = pred["pred_spread_pair"]
            mse_p = F.smooth_l1_loss(pspp, tspp, reduction="none")
            loss_sprp = (mse_p * sbm).sum() / sbm.sum().clamp(min=1e-6)

    w = weights
    total = (
        w.get("lab", 1.0) * loss_lab
        + w.get("prominence", 1.0) * loss_prom
        + w.get("spread", 1.0) * loss_spr
        + w.get("boundary", 1.0) * loss_b
        + w.get("dominant_letter", 0.0) * loss_d
        + w.get("word_lab_aux", 0.0) * loss_wl
        + w.get("spread_pair", 0.0) * loss_sprp
    )
    parts = {
        "loss_lab": loss_lab.detach(),
        "loss_prominence": loss_prom.detach(),
        "loss_spread": loss_spr.detach(),
        "loss_boundary": loss_b.detach() if isinstance(loss_b, torch.Tensor) else torch.tensor(0.0),
        "loss_dominant": loss_d.detach(),
        "loss_word_lab": loss_wl.detach(),
        "loss_spread_pair": loss_sprp.detach(),
    }
    return total, parts
