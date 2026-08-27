"""In-process PyTorch vs ONNX Runtime parity (used by API and optional CLI)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
from letter_sequence.data.sequence_dataset import collate_letter_batch, forward_letter_batch
from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
from letter_sequence.onnx.onnx_inference import create_inference_session, load_onnx_report, run_bilstm_onnx
from letter_sequence.training.io import load_checkpoint


def _stats(a: np.ndarray, b: np.ndarray, max_mean: float, max_max: float) -> dict[str, Any]:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.shape != b.shape:
        return {"shape_match": False, "mean_abs_diff": None, "max_abs_diff": None, "status": "fail"}
    if a.size == 0 and b.size == 0:
        return {
            "shape_match": True,
            "mean_abs_diff": 0.0,
            "max_abs_diff": 0.0,
            "status": "pass",
        }
    diff = np.abs(a - b)
    mean_d, max_d = float(np.mean(diff)), float(np.max(diff))
    st = "fail"
    if mean_d <= max_mean and max_d <= max_max:
        st = "pass"
    elif mean_d <= max_mean * 10 and max_d <= max_max * 5:
        st = "warn"
    return {
        "shape_match": True,
        "mean_abs_diff": mean_d,
        "max_abs_diff": max_d,
        "status": st,
    }


def run_parity_check(
    checkpoint_path: Path | str,
    onnx_dir: Path | str,
    *,
    words: list[str] | None = None,
    max_mean: float = 1e-3,
    max_max: float = 1e-2,
    write_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Compare PyTorch and ONNX. Optionally write ``parity_report.json`` to ``write_dir``."""
    ck = Path(checkpoint_path).resolve()
    odir = Path(onnx_dir).resolve()
    default_words = ["hello", "test", "a", "ab", "abcdefghijklmnopqrstuvwxyz"]
    wlist = [w.strip() for w in (words or default_words) if w and str(w).strip()]

    ckpt = load_checkpoint(ck, map_location="cpu")
    model = letter_sequence_model_from_config(ckpt.get("config") or {})
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    report = load_onnx_report(odir)
    session = create_inference_session(odir / report.get("onnx_path", "model.onnx"))
    inames = list(report["input_names"])
    use_ex = bool(getattr(model, "use_extra_features", False)) and getattr(model, "extra_dim", 0) > 0

    per_sample: list[dict[str, Any]] = []
    heads_agg: dict[str, list[float]] = {h: [] for h in ("pred_lab", "pred_prominence", "pred_spread", "pred_boundary")}
    heads_max: dict[str, list[float]] = {h: [] for h in heads_agg}

    for w in wlist:
        letters = list(w.lower())
        L = len(letters)
        row = {
            "letters": letters,
            "target_lab": [[0.0, 0.0, 0.0]] * L,
            "target_prominence": [0.0] * L,
            "target_spread": [0.0] * L,
            "target_boundary": [0.0] * max(0, L - 1),
        }
        batch = collate_letter_batch([row])
        with torch.no_grad():
            py = forward_letter_batch(model, batch)
        pl = {k: v.cpu().numpy() for k, v in py.items()}

        extra = model._extra_features(batch["input_ids"], batch["letter_mask"]).numpy() if use_ex else None
        ort = run_bilstm_onnx(
            session,
            input_ids=batch["input_ids"].numpy(),
            letter_mask=batch["letter_mask"].numpy(),
            extra_features=extra,
            input_names=inames,
        )
        b0 = 0
        sm: dict[str, Any] = {"word": w}
        st_lab = _stats(pl["pred_lab"][b0, :L], ort["pred_lab"][b0, :L], max_mean, max_max)
        sm["pred_lab"] = st_lab
        st_pr = _stats(pl["pred_prominence"][b0, :L], ort["pred_prominence"][b0, :L], max_mean, max_max)
        sm["pred_prominence"] = st_pr
        st_s = _stats(pl["pred_spread"][b0, :L], ort["pred_spread"][b0, :L], max_mean, max_max)
        sm["pred_spread"] = st_s
        if L > 1:
            st_b = _stats(pl["pred_boundary"][b0, : L - 1], ort["pred_boundary"][b0, : L - 1], max_mean, max_max)
        else:
            st_b = _stats(np.empty(0), np.empty(0), max_mean, max_max)
        sm["pred_boundary"] = st_b
        for h, o in (("pred_lab", st_lab), ("pred_prominence", st_pr), ("pred_spread", st_s), ("pred_boundary", st_b)):
            if o.get("mean_abs_diff") is not None:
                heads_agg[h].append(o["mean_abs_diff"])
            if o.get("max_abs_diff") is not None:
                heads_max[h].append(o["max_abs_diff"])
        per_sample.append(sm)

    per_head: dict[str, Any] = {}
    overall = "pass"
    for h in heads_agg:
        mlist, xlist = heads_agg[h], heads_max[h]
        m_obj = {
            "shape_match": True,
            "mean_abs_diff": float(np.mean(mlist)) if mlist else 0.0,
            "max_abs_diff": float(np.max(xlist)) if xlist else 0.0,
        }
        mflat = m_obj["mean_abs_diff"]
        mxflat = m_obj["max_abs_diff"]
        st2 = "pass" if mflat <= max_mean and mxflat <= max_max else (
            "warn" if mflat <= max_mean * 10 and mxflat <= max_max * 5 else "fail"
        )
        m_obj["status"] = st2
        per_head[h] = m_obj
        if st2 == "fail":
            overall = "fail"
        elif st2 == "warn" and overall != "fail":
            overall = "warn"

    summary: dict[str, Any] = {
        "checkpoint": str(ck),
        "onnx_dir": str(odir),
        "n_words": len(wlist),
        "per_head": per_head,
        "overall": overall,
    }
    if write_dir:
        wd = Path(write_dir)
        wd.mkdir(parents=True, exist_ok=True)
        (wd / "parity_report.json").write_text(
            json.dumps({"summary": summary, "per_sample": per_sample}, indent=2) + "\n", encoding="utf-8"
        )
    return {"summary": summary, "per_sample": per_sample}
