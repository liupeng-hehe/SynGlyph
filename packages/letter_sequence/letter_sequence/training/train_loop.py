"""Shared training loop for all model families (CLI and AL simulator call this in-process)."""

from __future__ import annotations

import json
import traceback
from functools import partial
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

from letter_sequence.data.sequence_dataset import (
    LetterSequenceDataset,
    collate_letter_batch,
    forward_letter_batch,
)
from letter_sequence.models.model_factory import build_model, normalize_model_family
from letter_sequence.training.io import load_checkpoint
from letter_sequence.training.losses import multitask_loss
from letter_sequence.training.metrics import compute_epoch_metrics


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def model_config_from_yaml(cfg: dict) -> dict:
    """Merge ``model_family`` from root or ``model`` section; default ``bilstm``."""
    mc = dict(cfg.get("model") or {})
    mf = mc.get("model_family") or cfg.get("model_family")
    mc["model_family"] = normalize_model_family(mf)
    return mc


def write_progress(
    out_dir: Path,
    *,
    status: str,
    history: list,
    total_epochs: int,
    best_val: float,
    current_epoch: int,
    global_step: int,
    train_loader_len: int,
    message: str | None = None,
) -> None:
    row = history[-1] if history else {}
    payload: dict[str, Any] = {
        "status": status,
        "current_epoch": current_epoch,
        "total_epochs": total_epochs,
        "global_step": global_step,
        "batches_per_epoch": train_loader_len,
        "history": history,
        "best_val_loss": best_val if best_val != float("inf") else None,
        "latest_train_loss": row.get("train_loss"),
        "latest_val_loss": row.get("val_loss"),
        "updated_at": _utc_now(),
    }
    if message:
        payload["message"] = message
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "progress.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def train_epoch(
    model: torch.nn.Module,
    loader: DataLoader,
    opt: torch.optim.Optimizer,
    device: torch.device,
    weights: dict,
) -> tuple[float, dict]:
    model.train()
    total_loss = 0.0
    n = 0
    parts_sum = {
        "loss_lab": 0.0,
        "loss_prominence": 0.0,
        "loss_spread": 0.0,
        "loss_boundary": 0.0,
        "loss_dominant": 0.0,
        "loss_word_lab": 0.0,
        "loss_spread_pair": 0.0,
    }
    for batch in loader:
        for k in batch:
            if isinstance(batch[k], torch.Tensor):
                batch[k] = batch[k].to(device)
        opt.zero_grad()
        pred = forward_letter_batch(model, batch)
        loss, parts = multitask_loss(pred, batch, weights)
        loss.backward()
        opt.step()
        bs = batch["input_ids"].shape[0]
        total_loss += float(loss.item()) * bs
        n += bs
        for k in parts_sum:
            if k in parts:
                parts_sum[k] += float(parts[k].item()) * bs
    for k in parts_sum:
        parts_sum[k] /= max(n, 1)
    return total_loss / max(n, 1), parts_sum


def eval_epoch_multitask_loss(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
    weights: dict,
) -> tuple[float, dict]:
    """
    Same weighted ``multitask_loss`` / batch aggregation as ``train_epoch``, under ``eval()``
    and ``no_grad``, so ``val_loss`` matches the ``train_loss`` definition.
    """
    model.eval()
    total_loss = 0.0
    n = 0
    parts_sum = {
        "loss_lab": 0.0,
        "loss_prominence": 0.0,
        "loss_spread": 0.0,
        "loss_boundary": 0.0,
        "loss_dominant": 0.0,
        "loss_word_lab": 0.0,
        "loss_spread_pair": 0.0,
    }
    with torch.no_grad():
        for batch in loader:
            for k in batch:
                if isinstance(batch[k], torch.Tensor):
                    batch[k] = batch[k].to(device)
            pred = forward_letter_batch(model, batch)
            loss, parts = multitask_loss(pred, batch, weights)
            bs = batch["input_ids"].shape[0]
            total_loss += float(loss.item()) * bs
            n += bs
            for pk in parts_sum:
                if pk in parts:
                    parts_sum[pk] += float(parts[pk].item()) * bs
    for pk in parts_sum:
        parts_sum[pk] /= max(n, 1)
    return total_loss / max(n, 1), parts_sum


def run_training(
    *,
    samples_jsonl: Path,
    out_dir: Path,
    cfg: dict,
    epochs: int | None = None,
) -> dict[str, Any]:
    """
    Train from YAML config dict; write checkpoint, history.json, metrics.json, progress.json.

    ``train_loss`` and ``val_loss`` in history both use the same weighted ``multitask_loss``
    (Smooth L1 + masks). ``val_mae_*`` / ``val_mae_total`` remain MAE diagnostics only.

    Returns final metrics dict (includes ``model_family``, ``best_val_loss``, ``val_detail`` if val).
    """
    data_cfg = cfg.get("data", {})
    model_cfg = model_config_from_yaml(cfg)
    loss_w = cfg.get("loss_weights", {})
    train_cfg = cfg.get("train", {})

    device = torch.device(train_cfg.get("device", "cpu"))
    n_epochs = epochs if epochs is not None else train_cfg.get("epochs", 50)
    batch_size = train_cfg.get("batch_size", 16)
    lr = float(train_cfg.get("lr", 1e-3))
    wd = float(train_cfg.get("weight_decay", 1e-4))
    train_seed = train_cfg.get("seed")
    gen: torch.Generator | None = None
    if train_seed is not None:
        s = int(train_seed)
        torch.manual_seed(s)
        gen = torch.Generator()
        gen.manual_seed(s)

    train_ds = LetterSequenceDataset(samples_jsonl, split="train")
    val_ds = LetterSequenceDataset(samples_jsonl, split="val")
    if len(train_ds) == 0:
        raise ValueError("No training samples; check JSONL and split.")
    ablation = (cfg or {}).get("ablation")
    _collate = partial(collate_letter_batch, ablation=ablation if isinstance(ablation, dict) else None)
    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=_collate,
        generator=gen,
    )
    val_loader = (
        DataLoader(val_ds, batch_size=batch_size, shuffle=False, collate_fn=_collate) if len(val_ds) else None
    )
    train_loader_len = len(train_loader)

    model = build_model(model_cfg).to(device)
    init_ckpt = train_cfg.get("init_checkpoint_path")
    if init_ckpt:
        ip = Path(init_ckpt).expanduser()
        if not ip.is_file():
            raise FileNotFoundError(f"init_checkpoint_path not found: {ip}")
        ckpt_init = load_checkpoint(ip, map_location=device)
        model.load_state_dict(ckpt_init["model_state"])
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=wd)

    history: list[dict] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")
    ckpt_path = out_dir / "letter_sequence.pt"
    fam = model_cfg["model_family"]

    write_progress(
        out_dir,
        status="running",
        history=[],
        total_epochs=n_epochs,
        best_val=best_val,
        current_epoch=0,
        global_step=0,
        train_loader_len=train_loader_len,
    )

    try:
        for epoch in range(1, n_epochs + 1):
            tr_loss, tr_parts = train_epoch(model, train_loader, opt, device, loss_w)
            global_step = epoch * train_loader_len
            row: dict = {
                "epoch": epoch,
                "train_loss": tr_loss,
                **{f"train_{k}": v for k, v in tr_parts.items()},
            }
            if val_loader:
                val_metrics = compute_epoch_metrics(model, val_loader, device)
                val_mt, val_mt_parts = eval_epoch_multitask_loss(model, val_loader, device, loss_w)
                # Same definition as train_loss (weighted multitask Smooth L1).
                row["val_loss"] = val_mt
                row.update({f"val_{k}": v for k, v in val_mt_parts.items()})
                # Diagnostic: sum of per-task MAEs (legacy composite; not comparable to train_loss).
                row["val_mae_total"] = (
                    val_metrics["mae_lab"]
                    + val_metrics["mae_prominence"]
                    + val_metrics["mae_spread"]
                    + val_metrics["mae_boundary"]
                )
                row["val_mae_lab"] = val_metrics["mae_lab"]
                row["val_mae_prominence"] = val_metrics["mae_prominence"]
                row["val_mae_spread"] = val_metrics["mae_spread"]
                row["val_mae_boundary"] = val_metrics["mae_boundary"]
                if row["val_loss"] < best_val:
                    best_val = row["val_loss"]
                    ckpt = {
                        "model_state": model.state_dict(),
                        "config": {
                            **model_cfg,
                            **data_cfg,
                            "loss_weights": loss_w,
                            "model_family": fam,
                        },
                        "epoch": epoch,
                    }
                    torch.save(ckpt, ckpt_path)
            else:
                torch.save(
                    {
                        "model_state": model.state_dict(),
                        "config": {
                            **model_cfg,
                            **data_cfg,
                            "loss_weights": loss_w,
                            "model_family": fam,
                        },
                        "epoch": epoch,
                    },
                    ckpt_path,
                )
            history.append(row)
            write_progress(
                out_dir,
                status="running",
                history=history,
                total_epochs=n_epochs,
                best_val=best_val,
                current_epoch=epoch,
                global_step=global_step,
                train_loader_len=train_loader_len,
            )

        (out_dir / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
        final_metrics: dict[str, Any] = {
            "history": history,
            "best_val_loss": best_val if val_loader else None,
            "model_family": fam,
        }
        if val_loader and ckpt_path.is_file():
            model.load_state_dict(load_checkpoint(ckpt_path, map_location=device)["model_state"])
            final_metrics["val_detail"] = compute_epoch_metrics(model, val_loader, device)
        (out_dir / "metrics.json").write_text(json.dumps(final_metrics, indent=2), encoding="utf-8")
        write_progress(
            out_dir,
            status="completed",
            history=history,
            total_epochs=n_epochs,
            best_val=best_val,
            current_epoch=n_epochs,
            global_step=n_epochs * train_loader_len,
            train_loader_len=train_loader_len,
        )
        return final_metrics
    except Exception as e:
        write_progress(
            out_dir,
            status="failed",
            history=history,
            total_epochs=n_epochs,
            best_val=best_val,
            current_epoch=len(history),
            global_step=len(history) * train_loader_len,
            train_loader_len=train_loader_len,
            message=f"{e!s}\n{traceback.format_exc()}",
        )
        raise
