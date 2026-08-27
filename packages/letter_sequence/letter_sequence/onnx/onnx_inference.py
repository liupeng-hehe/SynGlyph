"""ONNX Runtime inference for exported BiLSTM; outputs align with PyTorch forward dict (numpy)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np


def load_onnx_report(output_dir: Path | str) -> dict[str, Any]:
    import json

    p = Path(output_dir) / "export_report.json"
    return json.loads(p.read_text(encoding="utf-8"))


def run_bilstm_onnx(
    session: Any,
    *,
    input_ids: np.ndarray,
    letter_mask: np.ndarray,
    extra_features: np.ndarray | None,
    input_names: list[str],
) -> dict[str, np.ndarray]:
    """
    Run ONNX session from ``export_bilstm_to_onnx``; returns numpy arrays for each head.

    ``input_ids``: int64 [B, T]; ``letter_mask``: float32 [B, T];
    ``extra_features``: float32 [B, T, D] when the model was exported with extras.
    """
    feeds: dict[str, Any] = {
        input_names[0]: np.asarray(input_ids, dtype=np.int64),
        input_names[1]: np.asarray(letter_mask, dtype=np.float32),
    }
    if len(input_names) > 2:
        if extra_features is None:
            raise ValueError("extra_features required for this ONNX model")
        feeds[input_names[2]] = np.asarray(extra_features, dtype=np.float32)

    outputs = session.run(None, feeds)
    d: dict[str, np.ndarray] = {
        "pred_lab": outputs[0],
        "pred_prominence": outputs[1],
        "pred_spread": outputs[2],
        "pred_boundary": outputs[3],
    }
    if len(outputs) >= 7:
        d["pred_word_lab"] = outputs[4]
        d["pred_dominant_logits"] = outputs[5]
        d["pred_spread_pair"] = outputs[6]
    return d


def create_inference_session(onnx_path: Path | str, providers: list[str] | None = None) -> Any:
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    prov = providers or ["CPUExecutionProvider"]
    return ort.InferenceSession(str(onnx_path), sess_options=so, providers=prov)
