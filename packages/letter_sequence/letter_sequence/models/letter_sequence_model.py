"""BiLSTM encoder + multi-head outputs for letter sequences."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from letter_sequence.data.sequence_dataset import VOCAB_SIZE
from letter_sequence.models.model_factory import build_model


def letter_sequence_model_from_config(cfg: dict) -> nn.Module:
    """Build model from training checkpoint ``config`` (canonical ``model_family``: mlp|bilstm|...)."""
    return build_model(cfg)


def infer_extra_dim_from_state(state_dict: dict, emb_dim: int) -> int:
    """Infer concat feature dim from first Linear after embeddings (if present)."""
    if "lstm.weight_ih_l0" in state_dict:
        w = state_dict["lstm.weight_ih_l0"]
        input_size = w.shape[1]
        return max(0, input_size - emb_dim)
    return 4  # default extra bits


class LetterSequenceBiLSTM(nn.Module):
    def __init__(
        self,
        vocab_size: int = VOCAB_SIZE,
        emb_dim: int = 64,
        hidden: int = 128,
        num_layers: int = 1,
        dropout: float = 0.1,
        max_len: int = 64,
        pos_dim: int = 16,
        extra_dim: int = 16,
        use_extra_features: bool = True,
        use_word_aggregate: bool = True,
        use_dominant_head: bool = True,
        use_spread_pair_head: bool = True,
        word_agg_temperature: float = 1.0,
    ):
        super().__init__()
        self.vocab_size = vocab_size
        self.emb_dim = emb_dim
        self.hidden = hidden
        self.max_len = max_len
        self.use_extra_features = use_extra_features
        self.extra_dim = extra_dim if use_extra_features else 0
        self.use_word_aggregate = use_word_aggregate
        self.use_dominant_head = use_dominant_head
        self.use_spread_pair_head = use_spread_pair_head
        self.word_agg_temperature = max(word_agg_temperature, 1e-3)

        self.char_emb = nn.Embedding(vocab_size, emb_dim)
        self.pos_emb = nn.Embedding(max_len, pos_dim)
        lstm_in = emb_dim + pos_dim + self.extra_dim
        self.lstm = nn.LSTM(
            lstm_in,
            hidden,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        d_h = 2 * hidden
        self.lab_head = nn.Linear(d_h, 3)
        self.prom_head = nn.Linear(d_h, 1)
        self.spr_head = nn.Linear(d_h, 1)
        self.boundary_head = nn.Linear(d_h * 2, 1)
        self.dominant_head = nn.Linear(d_h, 1) if use_dominant_head else None
        self.spr_pair_head = nn.Linear(d_h * 2, 1) if use_spread_pair_head else None

    def _extra_features(
        self, input_ids: torch.Tensor, letter_mask: torch.Tensor, extra: torch.Tensor | None
    ) -> torch.Tensor:
        """
        If ``extra`` is provided [B,T,D], use it (caller supplies preprocessor output).
        Otherwise compute legacy 4-dim (must match self.extra_dim == 4).
        """
        B, T = input_ids.shape
        if extra is not None:
            D = int(extra.shape[-1])
            if D != self.extra_dim and D > self.extra_dim:
                extra = extra[:, :, : self.extra_dim]
            elif D < self.extra_dim:
                pad = torch.zeros(B, T, self.extra_dim - D, device=extra.device, dtype=extra.dtype)
                extra = torch.cat([extra, pad], dim=-1)
            return extra
        # fallback legacy: only for extra_dim==4
        if self.extra_dim != 4:
            return torch.zeros(B, T, self.extra_dim, device=input_ids.device, dtype=torch.float32)
        device = input_ids.device
        vowels = {ord(c) - ord("a") + 2 for c in "aeiou"}
        ids = input_ids
        is_vowel = torch.zeros(B, T, dtype=torch.bool, device=device)
        for vi in vowels:
            is_vowel = is_vowel | (ids == vi)
        is_vowel = is_vowel.float()
        cum = letter_mask.cumsum(dim=1)
        total = letter_mask.sum(dim=1, keepdim=True).clamp(min=1)
        is_first = (cum == 1).float() * letter_mask
        is_last = (cum == total).float() * letter_mask
        norm_len = (total / self.max_len).expand_as(letter_mask)
        return torch.stack([is_vowel, is_first, is_last, norm_len], dim=-1)

    def _pair_hidden(self, out: torch.Tensor) -> torch.Tensor:
        return torch.cat([out[:, :-1], out[:, 1:]], dim=-1)

    def forward(
        self,
        input_ids: torch.Tensor,
        letter_mask: torch.Tensor,
        extra_features: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        B, T = input_ids.shape
        device = input_ids.device
        char_e = self.char_emb(input_ids)
        pos = torch.arange(T, device=device).clamp(max=self.max_len - 1)
        pos_e = self.pos_emb(pos).unsqueeze(0).expand(B, -1, -1)
        if self.use_extra_features and self.extra_dim > 0:
            ex = self._extra_features(input_ids, letter_mask, extra_features)
            x = torch.cat([char_e, pos_e, ex], dim=-1)
        else:
            x = torch.cat([char_e, pos_e], dim=-1)
        out, _ = self.lstm(x)  # [B,T,2H]
        pred_lab = self.lab_head(out)
        pred_prom = self.prom_head(out).squeeze(-1)
        pred_spr = self.spr_head(out).squeeze(-1)
        pair = self._pair_hidden(out)
        pred_boundary = self.boundary_head(pair).squeeze(-1)
        pred: dict[str, torch.Tensor] = {
            "pred_lab": pred_lab,
            "pred_prominence": pred_prom,
            "pred_spread": pred_spr,
            "pred_boundary": pred_boundary,
        }
        if self.dominant_head is not None:
            pred["pred_dominant_logits"] = self.dominant_head(out).squeeze(-1)
        if self.spr_pair_head is not None:
            pred["pred_spread_pair"] = self.spr_pair_head(pair).squeeze(-1)
        # word-level Lab from prom-weighted letter labs (no detached head)
        w = (pred_prom / self.word_agg_temperature).masked_fill(letter_mask < 0.5, float("-inf"))
        w = F.softmax(w, dim=1) * letter_mask
        w = w / (w.sum(dim=1, keepdim=True) + 1e-6)
        pred["pred_word_lab"] = (w.unsqueeze(-1) * pred_lab).sum(dim=1)
        return pred
