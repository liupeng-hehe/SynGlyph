#!/usr/bin/env python3
"""Compare PyTorch BiLSTM forward vs ONNX Runtime for a checkpoint + exported model.onnx.

Run from repo with API env (onnxruntime + letter_sequence), e.g.:
  cd apps/api && uv run python ../../scripts/parity_test_bilstm_onnx.py --checkpoint X.pt --onnx-dir Y
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_PKG = _REPO / "packages" / "letter_sequence"
if _PKG.is_dir() and str(_PKG) not in sys.path:
    sys.path.insert(0, str(_PKG))

import numpy as np
import torch
from letter_sequence.data.sequence_dataset import collate_letter_batch, forward_letter_batch
from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
from letter_sequence.onnx.onnx_inference import create_inference_session, load_onnx_report, run_bilstm_onnx
from letter_sequence.training.io import load_checkpoint


def _row(text: str) -> dict:
    w = text.lower()
    letters = list(w)
    L = len(letters)
    return {
        "letters": letters,
        "target_lab": [[0.0, 0.0, 0.0]] * L,
        "target_prominence": [0.0] * L,
        "target_spread": [0.0] * L,
        "target_boundary": [0.0] * max(0, L - 1),
    }


def _tensor_stats(a: np.ndarray, b: np.ndarray) -> dict:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.shape != b.shape:
        return {
            "shape_match": False,
            "shape_a": list(a.shape),
            "shape_b": list(b.shape),
            "mean_abs_diff": None,
            "max_abs_diff": None,
            "has_nan": None,
            "has_inf": None,
        }
    if a.size == 0 and b.size == 0:
        return {
            "shape_match": True,
            "mean_abs_diff": 0.0,
            "max_abs_diff": 0.0,
            "has_nan": False,
            "has_inf": False,
        }
    diff = np.abs(a - b)
    return {
        "shape_match": True,
        "mean_abs_diff": float(np.mean(diff)),
        "max_abs_diff": float(np.max(diff)),
        "has_nan": bool(np.isnan(a).any() or np.isnan(b).any()),
        "has_inf": bool(np.isinf(a).any() or np.isinf(b).any()),
    }


def _pass_one(
    m: dict, *, max_mean: float, max_max: float
) -> str:
    if m.get("shape_match") is not True:
        return "fail"
    if m.get("has_nan") or m.get("has_inf"):
        return "fail"
    mean_d, max_d = m.get("mean_abs_diff"), m.get("max_abs_diff")
    if mean_d is None or max_d is None:
        return "fail"
    if mean_d <= max_mean and max_d <= max_max:
        return "pass"
    if mean_d <= max_mean * 10 and max_d <= max_max * 5:
        return "warn"
    return "fail"


def _compare_one_word(
    model: torch.nn.Module,
    session,  # noqa: ANN001
    input_names: list[str],
    w: str,
) -> dict[str, object]:
    row = _row(w)
    batch = collate_letter_batch([row])
    with torch.no_grad():
        py = forward_letter_batch(model, batch)
    L = int(batch["input_ids"].shape[1])
    pl = {k: v.cpu().numpy() for k, v in py.items()}

    use_extra = bool(getattr(model, "use_extra_features", False)) and getattr(model, "extra_dim", 0) > 0
    extra_np = None
    if use_extra:
        ex = model._extra_features(batch["input_ids"], batch["letter_mask"])
        extra_np = ex.cpu().numpy()

    ort = run_bilstm_onnx(
        session,
        input_ids=batch["input_ids"].numpy(),
        letter_mask=batch["letter_mask"].numpy(),
        extra_features=extra_np,
        input_names=input_names,
    )

    word_metrics: dict[str, object] = {"word": w}
    b = 0
    st_lab = _tensor_stats(pl["pred_lab"][b, :L], ort["pred_lab"][b, :L])
    word_metrics["pred_lab"] = st_lab
    st_pr = _tensor_stats(pl["pred_prominence"][b, :L], ort["pred_prominence"][b, :L])
    word_metrics["pred_prominence"] = st_pr
    st_spr = _tensor_stats(pl["pred_spread"][b, :L], ort["pred_spread"][b, :L])
    word_metrics["pred_spread"] = st_spr
    lb = L - 1
    if lb > 0:
        st_b = _tensor_stats(pl["pred_boundary"][b, :lb], ort["pred_boundary"][b, :lb])
    else:
        st_b = _tensor_stats(
            pl["pred_boundary"][b, :0].reshape(0), ort["pred_boundary"][b, :0].reshape(0)
        )
    word_metrics["pred_boundary"] = st_b
    return word_metrics


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--checkpoint", type=Path, required=True, help="Path to .pt")
    ap.add_argument(
        "--onnx-dir",
        type=Path,
        required=True,
        help="Directory with model.onnx + export_report.json",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Write parity_report.json and parity_samples.csv (default: --onnx-dir)",
    )
    ap.add_argument(
        "--words",
        type=str,
        default="hello,test,a,ab,abcdefghijklmnopqrstuvwxyz",
        help="Comma-separated test strings",
    )
    ap.add_argument("--max-mean", type=float, default=1e-3)
    ap.add_argument("--max-max", type=float, default=1e-2)
    args = ap.parse_args()

    out_dir = (args.out_dir or args.onnx_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    ckpt = load_checkpoint(args.checkpoint, map_location="cpu")
    cfg = ckpt.get("config") or {}
    model = letter_sequence_model_from_config(cfg)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    report = load_onnx_report(args.onnx_dir)
    onnx_path = Path(args.onnx_dir) / report.get("onnx_path", "model.onnx")
    session = create_inference_session(onnx_path)
    input_names = list(report["input_names"])

    words = [w.strip() for w in args.words.split(",") if w.strip()]

    per_sample: list[dict[str, object]] = []
    head_keys = ("pred_lab", "pred_prominence", "pred_spread", "pred_boundary")

    for w in words:
        wm = _compare_one_word(model, session, input_names, w)
        per_sample.append(wm)
        for h in head_keys:
            m = wm[h] if isinstance(wm.get(h), dict) else None
            if m and m.get("shape_match") and m.get("mean_abs_diff") is not None:
                aggregate[h].append(float(m["mean_abs_diff"]))
                aggregate[h].append(float(m["max_abs_diff"]))

    # Re-collect: mean of means and max of maxes per head
    per_head: dict[str, object] = {}
    worst = "pass"
    for h in head_keys:
        m_list = [float(per_sample[i][h]["mean_abs_diff"] or 0) for i in range(len(per_sample)) if isinstance(per_sample[i].get(h), dict) and per_sample[i][h].get("shape_match")]  # type: ignore[index]
        mx_list = [float(per_sample[i][h]["max_abs_diff"] or 0) for i in range(len(per_sample)) if isinstance(per_sample[i].get(h), dict) and per_sample[i][h].get("shape_match")]
        m_obj = {
            "shape_match": True,
            "mean_abs_diff": float(np.mean(m_list)) if m_list else 0.0,
            "max_abs_diff": float(np.max(mx_list)) if mx_list else 0.0,
            "has_nan": any(
                per_sample[i][h].get("has_nan")  # type: ignore[index]
                for i in range(len(per_sample))
                if isinstance(per_sample[i].get(h), dict)
            ),
            "has_inf": any(
                per_sample[i][h].get("has_inf")  # type: ignore[index]
                for i in range(len(per_sample))
                if isinstance(per_sample[i].get(h), dict)
            ),
        }
        p = _pass_one(m_obj, max_mean=args.max_mean, max_max=args.max_max)
        per_head[h] = {**m_obj, "status": p}
        if p == "fail":
            worst = "fail"
        elif p == "warn" and worst != "fail":
            worst = "warn"

    summary = {
        "checkpoint": str(args.checkpoint.resolve()),
        "onnx_dir": str(args.onnx_dir.resolve()),
        "n_words": len(words),
        "thresholds": {"max_mean": args.max_mean, "max_max": args.max_max},
        "per_head": per_head,
        "overall": worst,
    }

    (out_dir / "parity_report.json").write_text(
        json.dumps({"summary": summary, "per_sample": per_sample}, indent=2) + "\n",
        encoding="utf-8",
    )

    with (out_dir / "parity_samples.csv").open("w", newline="", encoding="utf-8") as f:
        cw = csv.writer(f)
        cw.writerow(["word", "head", "shape_match", "mean_abs_diff", "max_abs_diff", "status"])
        for s in per_sample:
            if not isinstance(s, dict):
                continue
            word = str(s.get("word", ""))
            for h in head_keys:
                v = s.get(h)
                if not isinstance(v, dict):
                    continue
                cw.writerow(
                    [
                        word,
                        h,
                        v.get("shape_match", ""),
                        v.get("mean_abs_diff", ""),
                        v.get("max_abs_diff", ""),
                        _pass_one(v, max_mean=args.max_mean, max_max=args.max_max)
                        if v.get("shape_match")
                        else "fail",
                    ]
                )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
