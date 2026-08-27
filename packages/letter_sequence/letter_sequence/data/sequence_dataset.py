"""PyTorch Dataset + collate for variable-length letter sequences."""

from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

from letter_sequence.data.legacy_extra import legacy_extra_features_numpy
from letter_sequence.phonology import PHON_LAYOUT_V1_DIM, enrich_word

# PAD=0, UNK=1, a-z -> 2..27
PAD_IDX = 0
UNK_IDX = 1
VOCAB_SIZE = 28
SCHEMA_VERSIONS_SUPPORTED = (2, 3)


def char_to_id(ch: str) -> int:
    if len(ch) != 1:
        return UNK_IDX
    o = ord(ch.lower())
    if ord("a") <= o <= ord("z"):
        return o - ord("a") + 2
    return UNK_IDX


def _row_extra_and_phon_mask(r: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """[L, K] and [L] phon validity mask (1=structured phonology ok)."""
    letters: list[str] = r["letters"]
    L = len(letters)
    K = PHON_LAYOUT_V1_DIM
    ex = np.zeros((L, K), dtype=np.float32)
    if L == 0:
        return ex, np.zeros(0, dtype=np.float32)
    sv = int(r.get("schema_version") or 2)
    if r.get("extra_features"):
        for t, rowf in enumerate(r["extra_features"]):
            for k, v in enumerate(rowf):
                if k < K and t < L:
                    ex[t, k] = float(v)
        pm = np.array([float(x) for x in (r.get("phon_mask") or [1.0] * L)][:L], dtype=np.float32)
        if len(pm) < L:
            pm = np.pad(pm, (0, L - len(pm)), constant_values=0.0)
        return ex, pm
    if sv < 3:
        leg = legacy_extra_features_numpy(letters)
        ex[:, :4] = leg
        return ex, np.zeros(L, dtype=np.float32)
    wt = (r.get("word_text") or "").strip() or "".join(letters)
    try:
        pr = enrich_word(wt)
        if pr.feature_matrix.shape[0] == L:
            ex = pr.feature_matrix.copy()
            pm = pr.phon_mask.astype(np.float32)
        else:
            leg = legacy_extra_features_numpy(letters)
            ex[:, :4] = leg
            pm = np.zeros(L, dtype=np.float32)
    except Exception:
        leg = legacy_extra_features_numpy(letters)
        ex[:, :4] = leg
        pm = np.zeros(L, dtype=np.float32)
    return ex, pm


def _ablation_zero_extra(
    ex: np.ndarray,
    ablation: dict[str, bool] | None,
) -> np.ndarray:
    if not ablation:
        return ex
    o = ex.copy()
    if not ablation.get("use_syllable", True):
        o[:, 4:8] = 0.0
    if not ablation.get("use_stress", True):
        o[:, 4:12] = 0.0
    if not ablation.get("use_neighbors", True):
        o[:, 8:10] = 0.0
    return o


def forward_letter_batch(model, batch: dict) -> object:
    """Call BiLSTM (3-arg) or MLP (2-arg) without ``TypeError``."""
    if len(inspect.signature(model.forward).parameters) >= 3:
        return model(batch["input_ids"], batch["letter_mask"], batch.get("extra_features"))
    return model(batch["input_ids"], batch["letter_mask"])


class LetterSequenceDataset(Dataset):
    """Loads JSONL lines with schema_version 2 or 3."""

    def __init__(self, jsonl_path: str | Path, split: str | None = None):
        self.path = Path(jsonl_path)
        self.rows: list[dict[str, Any]] = []
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if int(row.get("schema_version") or 0) not in SCHEMA_VERSIONS_SUPPORTED:
                    continue
                if split is not None and row.get("split") != split:
                    continue
                self.rows.append(row)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        return self.rows[idx]


def collate_letter_batch(
    batch: list[dict[str, Any]] | list[dict],
    *,
    ablation: dict[str, bool] | None = None,
) -> dict[str, torch.Tensor]:
    """Pad; includes extra_features, phon_mask, optional auxiliary targets for v2/v3."""
    B = len(batch)
    lengths = [len(r["letters"]) for r in batch]
    T = max(lengths)
    K = PHON_LAYOUT_V1_DIM

    input_ids = torch.full((B, T), PAD_IDX, dtype=torch.long)
    letter_mask = torch.zeros(B, T, dtype=torch.float32)
    target_lab = torch.zeros(B, T, 3, dtype=torch.float32)
    target_prom = torch.zeros(B, T, dtype=torch.float32)
    target_spr = torch.zeros(B, T, dtype=torch.float32)
    extra_features = torch.zeros(B, T, K, dtype=torch.float32)
    phon_mask = torch.zeros(B, T, dtype=torch.float32)

    Tm1 = max(0, T - 1)
    target_boundary = torch.zeros(B, Tm1, dtype=torch.float32)
    boundary_mask = torch.zeros(B, Tm1, dtype=torch.float32)
    # Auxiliary (masked when -1 or zero mask)
    target_dominant = torch.full((B,), -1.0, dtype=torch.float32)
    dominant_mask = torch.zeros(B, dtype=torch.float32)
    target_word_lab = torch.zeros(B, 3, dtype=torch.float32)
    word_lab_mask = torch.zeros(B, dtype=torch.float32)
    target_spread_pair = torch.zeros(B, Tm1, dtype=torch.float32)
    spread_pair_mask = torch.zeros(B, Tm1, dtype=torch.float32)

    for b, r in enumerate(batch):
        L = lengths[b]
        letters: list[str] = r["letters"]
        ex, pm = _row_extra_and_phon_mask(r)
        ex = _ablation_zero_extra(ex, ablation)
        for t in range(L):
            input_ids[b, t] = char_to_id(letters[t])
            letter_mask[b, t] = 1.0
            for k in range(K):
                extra_features[b, t, k] = float(ex[t, k])
            phon_mask[b, t] = float(pm[t]) if t < len(pm) else 0.0
        tl = r["target_lab"]
        tp = r["target_prominence"]
        ts = r["target_spread"]
        for t in range(L):
            target_lab[b, t] = torch.tensor(tl[t], dtype=torch.float32)
            target_prom[b, t] = float(tp[t])
            target_spr[b, t] = float(ts[t])
        tb = r.get("target_boundary") or []
        for j in range(L - 1):
            target_boundary[b, j] = float(tb[j])
            boundary_mask[b, j] = 1.0
            tsi = float(ts[j])
            tsj1 = float(ts[j + 1])
            target_spread_pair[b, j] = min(tsi, tsj1)
            spread_pair_mask[b, j] = 1.0

        td = r.get("target_dominant_letter_idx")
        if isinstance(td, int) and 0 <= td < L:
            target_dominant[b] = float(td)
            dominant_mask[b] = 1.0
        tw = r.get("target_word_lab")
        if isinstance(tw, (list, tuple)) and len(tw) == 3:
            target_word_lab[b] = torch.tensor([float(tw[0]), float(tw[1]), float(tw[2])], dtype=torch.float32)
            word_lab_mask[b] = 1.0

    out: dict[str, torch.Tensor] = {
        "input_ids": input_ids,
        "letter_mask": letter_mask,
        "target_lab": target_lab,
        "target_prominence": target_prom,
        "target_spread": target_spr,
        "target_boundary": target_boundary,
        "boundary_mask": boundary_mask,
        "lengths": torch.tensor(lengths, dtype=torch.long),
        "extra_features": extra_features,
        "phon_mask": phon_mask,
        "target_dominant": target_dominant,
        "dominant_mask": dominant_mask,
        "target_word_lab": target_word_lab,
        "word_lab_mask": word_lab_mask,
        "target_spread_pair": target_spread_pair,
        "spread_pair_mask": spread_pair_mask,
    }
    return out
