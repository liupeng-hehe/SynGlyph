"""Export a trained LetterSequenceBiLSTM checkpoint to ONNX (inference only)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn

from letter_sequence.models.model_factory import build_model, normalize_model_family
from letter_sequence.onnx.bilstm_exportable import LetterSequenceBiLSTMExportable
from letter_sequence.training.io import load_checkpoint


ONNX_OUT_VERSION = 2


class _BiLSTMOnnxTuple(nn.Module):
    """ONNX: fixed 7-tuple output (pad missing heads with zeros)."""

    def __init__(self, inner: nn.Module, three_inputs: bool):
        super().__init__()
        self.inner = inner
        self.three_inputs = three_inputs

    def forward(
        self, *args: torch.Tensor
    ) -> tuple[
        torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor
    ]:
        if self.three_inputs:
            input_ids, letter_mask, extra_features = args
            d = self.inner(input_ids, letter_mask, extra_features)
        else:
            input_ids, letter_mask = args
            d = self.inner(input_ids, letter_mask, None)
        B, T = input_ids.shape
        pwl = d.get("pred_word_lab")
        if pwl is None:
            pwl = torch.zeros(B, 3, device=input_ids.device, dtype=torch.float32)
        pdom = d.get("pred_dominant_logits")
        if pdom is None:
            pdom = torch.zeros(B, T, device=input_ids.device, dtype=torch.float32)
        pspp = d.get("pred_spread_pair")
        if pspp is None:
            pspp = torch.zeros(B, max(0, T - 1), device=input_ids.device, dtype=torch.float32)
        return (
            d["pred_lab"],
            d["pred_prominence"],
            d["pred_spread"],
            d["pred_boundary"],
            pwl,
            pdom,
            pspp,
        )


def export_bilstm_to_onnx(
    checkpoint_path: Path | str,
    output_dir: Path | str,
    *,
    opset: int = 14,
    dry_run: bool = False,
) -> dict[str, Any]:
    ckpt_path = Path(checkpoint_path).resolve()
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    ckpt = load_checkpoint(ckpt_path, map_location="cpu")
    cfg = dict(ckpt.get("config") or {})
    fam = normalize_model_family(cfg.get("model_family"))
    if fam != "bilstm":
        raise ValueError(f"ONNX export only supports model_family=bilstm, got {fam!r}")

    model = build_model(cfg)
    model.load_state_dict(ckpt["model_state"], strict=False)
    model.eval()

    use_extra = bool(getattr(model, "use_extra_features", False)) and getattr(model, "extra_dim", 0) > 0
    B, T = 1, 16
    input_ids = torch.ones(B, T, dtype=torch.long)
    letter_mask = torch.ones(B, T, dtype=torch.float32)

    if use_extra:
        inner = LetterSequenceBiLSTMExportable.from_bilstm(model)
        ed = inner.extra_dim
        extra = torch.zeros(B, T, ed, dtype=torch.float32)
        wrapped = _BiLSTMOnnxTuple(inner, three_inputs=True)
        args = (input_ids, letter_mask, extra)
        input_names = ["input_ids", "letter_mask", "extra_features"]
    else:
        wrapped = _BiLSTMOnnxTuple(model, three_inputs=False)
        args = (input_ids, letter_mask)
        input_names = ["input_ids", "letter_mask"]

    wrapped.eval()
    onnx_path = out / "model.onnx"
    output_names = [
        "pred_lab",
        "pred_prominence",
        "pred_spread",
        "pred_boundary",
        "pred_word_lab",
        "pred_dominant_logits",
        "pred_spread_pair",
    ]

    dynamic_axes: dict[str, dict[int, str]] = {
        "pred_lab": {0: "batch", 1: "time"},
        "pred_prominence": {0: "batch", 1: "time"},
        "pred_spread": {0: "batch", 1: "time"},
        "pred_boundary": {0: "batch", 1: "time_minus_1"},
        "pred_word_lab": {0: "batch"},
        "pred_dominant_logits": {0: "batch", 1: "time"},
        "pred_spread_pair": {0: "batch", 1: "time_minus_1"},
    }
    for name in input_names:
        if name == "extra_features":
            dynamic_axes[name] = {0: "batch", 1: "time", 2: "extra_dim"}
        else:
            dynamic_axes[name] = {0: "batch", 1: "time"}

    if not dry_run:
        torch.onnx.export(
            wrapped,
            args,
            str(onnx_path),
            input_names=input_names,
            output_names=output_names,
            opset_version=opset,
            do_constant_folding=True,
            dynamic_axes=dynamic_axes,
        )

    report: dict[str, Any] = {
        "onnx_out_version": ONNX_OUT_VERSION,
        "checkpoint_path": str(ckpt_path),
        "model_family": "bilstm",
        "use_extra_features": use_extra,
        "extra_dim": int(getattr(model, "extra_dim", 0)) if use_extra else 0,
        "opset": opset,
        "onnx_path": "model.onnx",
        "input_names": input_names,
        "output_names": output_names,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    if not dry_run:
        (out / "export_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    return report
