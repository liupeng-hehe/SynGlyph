"""Run letter-sequence model inference for a stimulus word (CPU).

PyTorch and optional ONNX Runtime backends. Imports torch / letter_sequence only when needed.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_model_cache: dict[str, Any] = {"path": None, "model": None, "ckpt": None, "trainer_palette": None}
_ort_cache: dict[str, Any] = {}


def _rebase_lab(
    pred_lab: list[list[float]],
    letters: list[str],
    trainer_palette: dict[str, list[float]] | None,
    user_palette: dict[str, list[float]] | None,
) -> list[list[float]]:
    """Rebase per-letter Lab predictions from trainer space to user space.

    structural_delta = pred_lab - trainer_palette[letter]
    user_final       = user_palette[letter] + structural_delta
    """
    if not trainer_palette or not user_palette:
        return pred_lab
    out: list[list[float]] = []
    for i, letter in enumerate(letters):
        raw = pred_lab[i] if i < len(pred_lab) else [50.0, 0.0, 0.0]
        base_t = trainer_palette.get(letter.lower(), [50.0, 0.0, 0.0])
        base_u = user_palette.get(letter.lower(), base_t)
        delta = [raw[j] - base_t[j] for j in range(3)]
        out.append(_clamp_lab([base_u[j] + delta[j] for j in range(3)]))
    return out


def _letter_sequence_repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _ensure_letter_sequence_on_path() -> None:
    try:
        import letter_sequence  # noqa: F401

        return
    except ImportError:
        pass
    pkg_root = _letter_sequence_repo_root() / "packages" / "letter_sequence"
    if pkg_root.is_dir():
        s = str(pkg_root)
        if s not in sys.path:
            sys.path.insert(0, s)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _clamp_lab(triple: list[float]) -> list[float]:
    l, a, b = triple
    return [
        max(0.0, min(100.0, float(l))),
        max(-128.0, min(127.0, float(a))),
        max(-128.0, min(127.0, float(b))),
    ]


def _build_inference_row(letters: list[str], word_key: str) -> dict[str, Any]:
    L = len(letters)
    return {
        "letters": letters,
        "word_text": word_key,
        "schema_version": 2,
        "target_lab": [[0.0, 0.0, 0.0]] * L,
        "target_prominence": [0.0] * L,
        "target_spread": [0.0] * L,
        "target_boundary": [0.0] * max(0, L - 1),
    }


def _response_from_pred(
    word_text: str,
    L: int,
    pred: dict[str, Any],
    *,
    pron: Any = None,
) -> dict[str, Any]:
    import numpy as np
    import torch

    def to_np1(x: Any, tslice: int) -> np.ndarray:
        if isinstance(x, np.ndarray):
            a = x[0, :tslice] if x.ndim == 2 else x[:tslice]
            return np.asarray(a, dtype=np.float32)
        if isinstance(x, torch.Tensor):
            return x[0, :tslice].detach().cpu().numpy()
        return np.zeros((0,), dtype=np.float32)

    pl = to_np1(pred["pred_lab"], L)
    pp = to_np1(pred["pred_prominence"], L)
    ps = to_np1(pred["pred_spread"], L)
    pb = to_np1(pred["pred_boundary"], max(0, L - 1)) if L > 1 else np.array([], dtype=np.float32)

    pred_lab = [_clamp_lab([float(pl[i, 0]), float(pl[i, 1]), float(pl[i, 2])]) for i in range(L)]
    pred_prominence = [_clamp01(float(pp[i])) for i in range(L)]
    pred_spread = [_clamp01(float(ps[i])) for i in range(L)]
    pred_boundary = [_clamp01(float(pb[i])) for i in range(len(pb))]

    out: dict[str, Any] = {
        "word_text": word_text,
        "pred_lab": pred_lab,
        "pred_prominence": pred_prominence,
        "pred_spread": pred_spread,
        "pred_boundary": pred_boundary,
    }
    pwl = pred.get("pred_word_lab")
    if pwl is not None:
        if isinstance(pwl, np.ndarray):
            w0 = pwl[0] if pwl.ndim == 2 else pwl
        else:
            w0 = pwl[0].detach().cpu().numpy() if isinstance(pwl, torch.Tensor) else np.asarray(pwl[0], dtype=np.float32)
        out["suggested_word_lab"] = _clamp_lab([float(w0[0]), float(w0[1]), float(w0[2])])
    pspp = pred.get("pred_spread_pair")
    if pspp is not None and L > 1:
        sp = to_np1(pspp, L - 1)
        out["pred_spread_pair"] = [_clamp01(float(sp[i])) for i in range(len(sp))]
    pdom = pred.get("pred_dominant_logits")
    if pdom is not None:
        dl = to_np1(pdom, L) if L else np.array([], dtype=np.float32)
        out["suggested_dominant_letter_idx"] = int(np.argmax(dl)) if len(dl) else 0
    else:
        out["suggested_dominant_letter_idx"] = int(max(range(L), key=lambda i: pred_prominence[i]) if L else 0)

    if pron is None:
        from letter_sequence.phonology import enrich_word

        pron = enrich_word(word_text)
    pdict = pron.to_dict() if hasattr(pron, "to_dict") else {}
    out["preprocessing"] = {
        "syllable_count": int(getattr(pron, "syllable_count", 0) or 0),
        "stress_pattern": str(getattr(pron, "stress_pattern", "") or pdict.get("stress_pattern", "")),
        "pronunciation_source": str(getattr(pron, "pronunciation_source", "unknown")),
        "parse_confidence": float(getattr(pron, "pronunciation_confidence", 0.0)),
        "preprocessing_version": str(getattr(pron, "preprocessing_version", "1.0.0")),
    }
    cr = pdict.get("char_rows") or [None] * L
    letters_detail = []
    for t in range(L):
        cinfo: dict = (cr[t] or {}) if t < len(cr) and isinstance(cr[t], dict) else {}
        ch = list(word_text)[t] if t < len(list(word_text)) else ""
        letters_detail.append(
            {
                "idx": t,
                "ch": ch,
                "pred_lab": pred_lab[t],
                "pred_prominence": pred_prominence[t],
                "syllable_idx": cinfo.get("syllable_idx", 0),
                "in_stressed_syllable": cinfo.get("is_in_stressed_syllable", False),
            }
        )
    out["letters_detail"] = letters_detail
    psp = out.get("pred_spread_pair")
    if not isinstance(psp, list):
        psp = [0.0] * max(0, L - 1)
    pairwise: list[dict[str, Any]] = []
    for j in range(max(0, L - 1)):
        pj = psp[j] if j < len(psp) else 0.0
        pairwise.append(
            {
                "left": j,
                "right": j + 1,
                "pred_boundary": pred_boundary[j] if j < len(pred_boundary) else 0.0,
                "pred_spread_pair": pj,
            }
        )
    out["pairwise"] = pairwise
    out["word"] = {
        "suggested_best_lab": out.get("suggested_word_lab", pred_lab[0] if pred_lab else [50.0, 0.0, 0.0]),
        "dominant_letter_idx": int(out.get("suggested_dominant_letter_idx", 0)),
        "confidence_tier": "ok" if out["preprocessing"]["parse_confidence"] > 0.5 else "low",
    }
    return out


def predict_word(
    checkpoint_path: Path,
    word_text: str,
    *,
    backend: str = "pytorch",
    onnx_path: Path | None = None,
    preprocessing_override: dict[str, Any] | None = None,
    user_palette: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    b = (backend or "pytorch").strip().lower()
    if b not in ("pytorch", "onnx"):
        raise ValueError("backend must be pytorch or onnx")
    if not word_text:
        raise ValueError("empty word")

    _ensure_letter_sequence_on_path()
    if b == "pytorch":
        out = _predict_pytorch(checkpoint_path, word_text, preprocessing_override=preprocessing_override)
    else:
        out = _predict_onnx(checkpoint_path, word_text, onnx_path, preprocessing_override=preprocessing_override)

    if user_palette:
        trainer_palette = _model_cache.get("trainer_palette")
        wk = "".join(c for c in word_text.lower() if c.isalpha())
        letters = list(wk)
        rebased = _rebase_lab(out["pred_lab"], letters, trainer_palette, user_palette)
        out["pred_lab"] = rebased
        # Sync letters_detail so callers get consistent data.
        for detail in out.get("letters_detail", []):
            idx = detail.get("idx", -1)
            if 0 <= idx < len(rebased):
                detail["pred_lab"] = rebased[idx]
        out["palette_rebased"] = True
        out["trainer_palette_available"] = trainer_palette is not None

    return out


def _predict_pytorch(
    checkpoint_path: Path,
    word_text: str,
    *,
    preprocessing_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import torch
    from letter_sequence.data.sequence_dataset import collate_letter_batch, forward_letter_batch
    from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
    from letter_sequence.training.io import load_checkpoint

    wk = "".join(c for c in word_text.lower() if c.isalpha())
    letters = list(wk)
    L = len(letters)
    row = _build_inference_row(letters, wk)
    batch = collate_letter_batch([row])
    device = torch.device("cpu")

    path_str = str(checkpoint_path.resolve())
    if _model_cache["path"] != path_str or _model_cache["model"] is None:
        ckpt = load_checkpoint(checkpoint_path, map_location=device)
        cfg = ckpt.get("config") or {}
        model = letter_sequence_model_from_config(cfg)
        model.load_state_dict(ckpt["model_state"], strict=False)
        model.eval()
        _model_cache["path"] = path_str
        _model_cache["model"] = model
        # Prefer palette baked into checkpoint; fall back to file on disk.
        palette = ckpt.get("trainer_palette")
        if palette is None:
            from app.services.trainer_palette import load_trainer_palette
            palette = load_trainer_palette()
        _model_cache["trainer_palette"] = palette
    model = _model_cache["model"]

    for k in batch:
        if isinstance(batch[k], torch.Tensor):
            batch[k] = batch[k].to(device)
    ex = batch.get("extra_features")
    if ex is not None and preprocessing_override and "feature_matrix" in preprocessing_override:
        import numpy as np

        fm = np.asarray(preprocessing_override["feature_matrix"], dtype=np.float32)
        if fm.shape[0] == L:
            ex[0, :L, :] = torch.from_numpy(fm).to(ex.device, dtype=ex.dtype)
    with torch.no_grad():
        if ex is not None:
            batch["extra_features"] = ex
        pred = forward_letter_batch(model, batch)
    from letter_sequence.phonology import enrich_word

    pron = enrich_word(wk)
    return _response_from_pred(wk, L, pred, pron=pron)


def _get_ort_session(onnx_path: Path) -> Any:
    from letter_sequence.onnx.onnx_inference import create_inference_session, load_onnx_report
    from pathlib import Path as P

    key = str(P(onnx_path).resolve())
    if key not in _ort_cache:
        odir = P(onnx_path).parent
        _ort_cache[key] = {
            "session": create_inference_session(onnx_path),
            "report": load_onnx_report(odir),
        }
    return _ort_cache[key]["session"], _ort_cache[key]["report"]


def _predict_onnx(
    checkpoint_path: Path,
    word_text: str,
    onnx_path: Path | None,
    *,
    preprocessing_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import numpy as np
    import torch
    from letter_sequence.data.sequence_dataset import collate_letter_batch
    from letter_sequence.onnx.onnx_inference import run_bilstm_onnx
    from letter_sequence.training.io import load_checkpoint

    op = onnx_path
    if op is None or not op.is_file():
        for rel in ("onnx_runtime/model.onnx", "model.onnx"):
            cand = checkpoint_path.parent / rel
            if cand.is_file():
                op = cand
                break
    if op is None or not op.is_file():
        raise FileNotFoundError(
            "ONNX file not found: set onnx_path, or place model.onnx in the checkpoint directory "
            "or in onnx_runtime/ next to the .pt"
        )

    wk = "".join(c for c in word_text.lower() if c.isalpha())
    letters = list(wk)
    L = len(letters)
    row = _build_inference_row(letters, wk)
    batch = collate_letter_batch([row])
    device = torch.device("cpu")

    path_str = str(checkpoint_path.resolve())
    if _model_cache["path"] != path_str or _model_cache["model"] is None:
        from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config

        ckpt = load_checkpoint(checkpoint_path, map_location=device)
        model = letter_sequence_model_from_config(ckpt.get("config") or {})
        model.load_state_dict(ckpt["model_state"], strict=False)
        model.eval()
        _model_cache["path"] = path_str
        _model_cache["model"] = model
    for k in batch:
        if isinstance(batch[k], torch.Tensor):
            batch[k] = batch[k].to(device)
    ex = batch.get("extra_features")
    if ex is not None and preprocessing_override and "feature_matrix" in preprocessing_override:
        fm = np.asarray(preprocessing_override["feature_matrix"], dtype=np.float32)
        if fm.shape[0] == L:
            ex[0, :L, :] = torch.from_numpy(fm).to(ex.device, dtype=ex.dtype)

    session, report = _get_ort_session(op)
    input_names = list(report.get("input_names", ["input_ids", "letter_mask"]))
    use_extra = len(input_names) > 2
    extra_np = None
    if use_extra and ex is not None:
        extra_np = ex.cpu().numpy()
    else:
        extra_np = None

    pred = run_bilstm_onnx(
        session,
        input_ids=batch["input_ids"].numpy(),
        letter_mask=batch["letter_mask"].numpy(),
        extra_features=extra_np,
        input_names=input_names,
    )
    from letter_sequence.phonology import enrich_word

    pron = enrich_word(wk)
    return _response_from_pred(wk, L, pred, pron=pron)

