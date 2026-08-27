"""Batch-level MAE metrics for evaluation."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import torch

from letter_sequence.data.sequence_dataset import forward_letter_batch


def compute_batch_mae(
    pred: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
) -> dict[str, float]:
    """Overall MAE per target (masked)."""
    lm = batch["letter_mask"]
    bm = batch["boundary_mask"]
    out: dict[str, float] = {}
    with torch.no_grad():
        e_lab = (pred["pred_lab"] - batch["target_lab"]).abs().mean(dim=-1)
        out["mae_lab"] = float(((e_lab * lm).sum() / lm.sum().clamp(min=1e-6)).item())
        out["mae_prominence"] = float(
            (((pred["pred_prominence"] - batch["target_prominence"]).abs() * lm).sum() / lm.sum().clamp(min=1e-6)).item()
        )
        out["mae_spread"] = float(
            (((pred["pred_spread"] - batch["target_spread"]).abs() * lm).sum() / lm.sum().clamp(min=1e-6)).item()
        )
        if bm.sum() > 0:
            out["mae_boundary"] = float(
                (((pred["pred_boundary"] - batch["target_boundary"]).abs() * bm).sum() / bm.sum().clamp(min=1e-6)).item()
            )
        else:
            out["mae_boundary"] = 0.0
        if "pred_word_lab" in pred and batch.get("word_lab_mask") is not None and batch["word_lab_mask"].sum() > 0:
            wm = batch["word_lab_mask"]
            ewl = (pred["pred_word_lab"] - batch["target_word_lab"]).abs().mean(dim=-1)
            out["mae_word_lab"] = float(((ewl * wm).sum() / wm.sum().clamp(min=1e-6)).item())
    return out


def _default_letter_bucket() -> dict[str, float]:
    return {"sum_prom": 0.0, "n_prom": 0, "sum_spr": 0.0, "n_spr": 0, "sum_l": 0.0, "sum_a": 0.0, "sum_b": 0.0, "n_lab": 0}


def _default_bigram_bucket() -> dict[str, float]:
    return {"sum": 0.0, "n": 0}


def accumulate_per_letter_stats(
    pred: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
    accum: dict[str, dict[str, float]] | None = None,
) -> dict[str, dict[str, float]]:
    """Accumulate sum abs error and count per letter a-z for prom/spread/Lab channels."""
    if accum is None:
        accum = defaultdict(_default_letter_bucket)
    input_ids = batch["input_ids"]
    lm = batch["letter_mask"]
    B, T = input_ids.shape
    with torch.no_grad():
        for b in range(B):
            for t in range(T):
                if lm[b, t] < 0.5:
                    continue
                idx = int(input_ids[b, t].item())
                if idx < 2 or idx > 27:
                    ch = "?"
                else:
                    ch = chr(ord("a") + idx - 2)
                st = accum[ch]
                st["sum_prom"] += abs(float(pred["pred_prominence"][b, t] - batch["target_prominence"][b, t]))
                st["n_prom"] += 1
                st["sum_spr"] += abs(float(pred["pred_spread"][b, t] - batch["target_spread"][b, t]))
                st["n_spr"] += 1
                dl = (pred["pred_lab"][b, t] - batch["target_lab"][b, t]).abs()
                st["sum_l"] += float(dl[0])
                st["sum_a"] += float(dl[1])
                st["sum_b"] += float(dl[2])
                st["n_lab"] += 1
    return dict(accum)


def per_letter_mae_to_json(accum: dict[str, dict[str, float]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for ch, st in sorted(accum.items()):
        out[ch] = {
            "mae_prominence": st["sum_prom"] / st["n_prom"] if st["n_prom"] else 0.0,
            "mae_spread": st["sum_spr"] / st["n_spr"] if st["n_spr"] else 0.0,
            "mae_lab_l": st["sum_l"] / st["n_lab"] if st["n_lab"] else 0.0,
            "mae_lab_a": st["sum_a"] / st["n_lab"] if st["n_lab"] else 0.0,
            "mae_lab_b": st["sum_b"] / st["n_lab"] if st["n_lab"] else 0.0,
            "count": st["n_lab"],
        }
    return out


def accumulate_boundary_bigram(
    pred: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
    accum: dict[str, dict[str, float]] | None = None,
) -> dict[str, dict[str, float]]:
    if accum is None:
        accum = defaultdict(lambda: {"sum": 0.0, "n": 0})
    input_ids = batch["input_ids"]
    bm = batch["boundary_mask"]
    pb = pred["pred_boundary"]
    tb = batch["target_boundary"]
    B, Tm1 = bm.shape
    with torch.no_grad():
        for b in range(B):
            for j in range(Tm1):
                if bm[b, j] < 0.5:
                    continue
                c1 = chr(ord("a") + int(input_ids[b, j].item()) - 2) if 2 <= int(input_ids[b, j]) <= 27 else "?"
                c2 = chr(ord("a") + int(input_ids[b, j + 1].item()) - 2) if 2 <= int(input_ids[b, j + 1]) <= 27 else "?"
                key = f"{c1}{c2}"
                accum[key]["sum"] += abs(float(pb[b, j] - tb[b, j]))
                accum[key]["n"] += 1
    return dict(accum)


def boundary_bigram_to_json(accum: dict[str, dict[str, float]]) -> dict[str, float]:
    return {k: (v["sum"] / v["n"] if v["n"] else 0.0) for k, v in sorted(accum.items())}


def compute_epoch_metrics(
    model: torch.nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
) -> dict[str, Any]:
    """Average losses-style MAE over loader."""
    model.eval()
    tot = {"mae_lab": 0.0, "mae_prominence": 0.0, "mae_spread": 0.0, "mae_boundary": 0.0}
    n = 0
    pl_acc: dict[str, dict[str, float]] | defaultdict = defaultdict(_default_letter_bucket)
    bg_acc: dict[str, dict[str, float]] | defaultdict = defaultdict(_default_bigram_bucket)
    with torch.no_grad():
        for batch in loader:
            for k in batch:
                if isinstance(batch[k], torch.Tensor):
                    batch[k] = batch[k].to(device)
            pred = forward_letter_batch(model, batch)
            m = compute_batch_mae(pred, batch)
            bs = batch["input_ids"].shape[0]
            for k in tot:
                tot[k] += m[k] * bs
            n += bs
            accumulate_per_letter_stats(pred, batch, pl_acc)
            accumulate_boundary_bigram(pred, batch, bg_acc)
    for k in tot:
        tot[k] /= max(n, 1)
    return {
        **tot,
        "per_letter": per_letter_mae_to_json(dict(pl_acc)),
        "boundary_mae_by_bigram": boundary_bigram_to_json(dict(bg_acc)),
    }
