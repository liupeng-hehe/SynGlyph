"""
Phase 2 experiment metrics: slice buckets (fixed thresholds), boundary F1@0.5, latency protocol.
Thresholds are duplicated in docs/PHASE2_EXPERIMENTS.md — keep in sync.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from letter_sequence.data.sequence_dataset import (
    LetterSequenceDataset,
    collate_letter_batch,
    forward_letter_batch,
)
from letter_sequence.models.model_factory import build_model
from letter_sequence.training.io import load_checkpoint
from letter_sequence.training.metrics import compute_epoch_metrics

# --- Fixed slice thresholds (do not change between runs) ---
WORD_LENGTH_SHORT_MAX = 3
WORD_LENGTH_MEDIUM_MAX = 7
BOUNDARY_DENSITY_LOW_MAX = 0.25


def word_length_bucket(num_letters: int) -> str:
    L = int(num_letters)
    if L <= WORD_LENGTH_SHORT_MAX:
        return "short"
    if L <= WORD_LENGTH_MEDIUM_MAX:
        return "medium"
    return "long"


def boundary_density_bucket(target_boundary: list[float], num_letters: int) -> str:
    T = int(num_letters)
    if T < 2:
        return "low"
    tb = target_boundary or []
    nz = sum(1 for x in tb[: T - 1] if float(x) > 0.5)
    dens = nz / max(T - 1, 1)
    return "low" if dens < BOUNDARY_DENSITY_LOW_MAX else "high"


LATENCY_DEVICE = "cpu"
LATENCY_BATCH_SIZE = 8
LATENCY_WARMUP = 3
LATENCY_REPEATS = 10
LATENCY_WORDS = ("cat", "hello", "testing")


def _make_synthetic_batch(device: torch.device, batch_size: int) -> dict[str, torch.Tensor]:
    rows = []
    for i in range(batch_size):
        w = LATENCY_WORDS[i % len(LATENCY_WORDS)]
        letters = list(w.lower())
        L = len(letters)
        rows.append(
            {
                "letters": letters,
                "target_lab": [[0.0, 0.0, 0.0]] * L,
                "target_prominence": [0.0] * L,
                "target_spread": [0.0] * L,
                "target_boundary": [0.0] * max(0, L - 1),
            }
        )
    return collate_letter_batch(rows)


def measure_inference_latency_ms(
    checkpoint_path: Path,
    *,
    device: str | torch.device = LATENCY_DEVICE,
    batch_size: int = LATENCY_BATCH_SIZE,
    warmup: int = LATENCY_WARMUP,
    repeats: int = LATENCY_REPEATS,
) -> dict[str, Any]:
    dev = torch.device(device)
    ckpt = load_checkpoint(checkpoint_path, map_location=dev)
    cfg = ckpt.get("config") or {}
    model = build_model(cfg)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    model.to(dev)
    batch = _make_synthetic_batch(dev, batch_size)
    for k in batch:
        if isinstance(batch[k], torch.Tensor):
            batch[k] = batch[k].to(dev)
    with torch.no_grad():
        for _ in range(warmup):
            forward_letter_batch(model, batch)
    times: list[float] = []
    with torch.no_grad():
        for _ in range(repeats):
            t0 = time.perf_counter()
            forward_letter_batch(model, batch)
            times.append((time.perf_counter() - t0) * 1000.0)
    mean_ms = sum(times) / max(len(times), 1)
    return {
        "avg_inference_latency_ms": mean_ms,
        "protocol": {
            "device": str(dev),
            "batch_size": batch_size,
            "warmup": warmup,
            "measurement_repeats": repeats,
            "synthetic_words": list(LATENCY_WORDS),
        },
    }


def compute_cost_metrics(checkpoint_path: Path, model: torch.nn.Module) -> dict[str, Any]:
    p = Path(checkpoint_path)
    return {
        "checkpoint_size_bytes": p.stat().st_size if p.is_file() else 0,
        "param_count": sum(x.numel() for x in model.parameters()),
    }


def _row_mae_lab_prom_spr_boundary(
    pred: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
    bi: int,
) -> tuple[float, float, float, float]:
    lm = batch["letter_mask"][bi]
    bm = batch["boundary_mask"][bi]
    pl = pred["pred_lab"][bi]
    tl = batch["target_lab"][bi]
    e_lab = (pl - tl).abs().mean(dim=-1)
    m_lab = float(((e_lab * lm).sum() / lm.sum().clamp(min=1e-6)).item())
    e_p = (pred["pred_prominence"][bi] - batch["target_prominence"][bi]).abs()
    m_p = float(((e_p * lm).sum() / lm.sum().clamp(min=1e-6)).item())
    e_s = (pred["pred_spread"][bi] - batch["target_spread"][bi]).abs()
    m_s = float(((e_s * lm).sum() / lm.sum().clamp(min=1e-6)).item())
    pb = pred["pred_boundary"][bi]
    tb = batch["target_boundary"][bi]
    if bm.sum() < 1:
        m_b = 0.0
    else:
        val = ((pb - tb).abs() * bm).sum() / bm.sum().clamp(min=1e-6)
        m_b = float(val.detach().cpu().item()) if torch.is_tensor(val) else float(val)
    return m_lab, m_p, m_s, m_b


def evaluate_extended_metrics(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> dict[str, Any]:
    """MAE + boundary F1@0.5 + per-slice mean MAE (fixed buckets)."""
    base = compute_epoch_metrics(model, loader, device)
    model.eval()
    b_tp = b_fp = b_fn = 0.0

    slice_keys: dict[str, dict[str, float]] = {}
    slice_n: dict[str, int] = {}

    def _sk(wb: str, bd: str) -> str:
        return f"{wb}_{bd}"

    with torch.no_grad():
        for batch in loader:
            for k in batch:
                if isinstance(batch[k], torch.Tensor):
                    batch[k] = batch[k].to(device)
            pred = forward_letter_batch(model, batch)
            B = batch["input_ids"].shape[0]
            pb = pred["pred_boundary"]
            tb = batch["target_boundary"]
            bm = batch["boundary_mask"]
            if pb.numel() and bm.sum() > 0:
                pr = torch.sigmoid(pb)
                pred_bin = (pr >= 0.5).float()
                tgt_bin = (tb >= 0.5).float()
                b_tp += ((pred_bin * tgt_bin) * bm).sum().item()
                b_fp += ((pred_bin * (1 - tgt_bin)) * bm).sum().item()
                b_fn += (((1 - pred_bin) * tgt_bin) * bm).sum().item()

            for bi in range(B):
                lm = batch["letter_mask"][bi]
                L = int(lm.sum().item())
                wb = word_length_bucket(L)
                tlist = tb[bi, : max(0, L - 1)].detach().cpu().tolist() if L >= 2 else []
                bd = boundary_density_bucket(tlist, L)
                sk = _sk(wb, bd)
                slice_n[sk] = slice_n.get(sk, 0) + 1
                ml, mp, ms, mb = _row_mae_lab_prom_spr_boundary(pred, batch, bi)
                if sk not in slice_keys:
                    slice_keys[sk] = {"mae_lab": 0.0, "mae_prom": 0.0, "mae_spr": 0.0, "mae_boundary": 0.0}
                slice_keys[sk]["mae_lab"] += ml
                slice_keys[sk]["mae_prom"] += mp
                slice_keys[sk]["mae_spr"] += ms
                slice_keys[sk]["mae_boundary"] += mb

    denom = 2 * b_tp + b_fp + b_fn
    bf1 = float(2 * b_tp / denom) if denom > 1e-8 else 0.0

    slice_means: dict[str, Any] = {}
    for sk, acc in slice_keys.items():
        n = slice_n.get(sk, 1)
        slice_means[sk] = {
            "n": n,
            "mae_lab": acc["mae_lab"] / n,
            "mae_prominence": acc["mae_prom"] / n,
            "mae_spread": acc["mae_spr"] / n,
            "mae_boundary": acc["mae_boundary"] / n,
        }

    out = {
        "mae_lab": base["mae_lab"],
        "mae_prominence": base["mae_prominence"],
        "mae_spread": base["mae_spread"],
        "mae_boundary": base["mae_boundary"],
        "boundary_f1_at_0_5": bf1,
        "slice_thresholds": {
            "word_length": {
                "short_max": WORD_LENGTH_SHORT_MAX,
                "medium_max": WORD_LENGTH_MEDIUM_MAX,
            },
            "boundary_density_low_max": BOUNDARY_DENSITY_LOW_MAX,
        },
        "slice_metrics": slice_means,
    }
    return out
