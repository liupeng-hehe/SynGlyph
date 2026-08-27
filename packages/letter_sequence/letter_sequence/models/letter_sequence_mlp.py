"""Minimal per-token MLP baseline (Phase 2): char + pos emb, first/last, length, optional neighbors."""

from __future__ import annotations

import torch
import torch.nn as nn

from letter_sequence.data.sequence_dataset import VOCAB_SIZE


class LetterSequenceMLP(nn.Module):
    """
    Same output keys as BiLSTM: pred_lab [B,T,3], pred_prominence [B,T], pred_spread [B,T], pred_boundary [B,T-1].
    """

    def __init__(
        self,
        vocab_size: int = VOCAB_SIZE,
        emb_dim: int = 64,
        pos_dim: int = 16,
        hidden_dim: int = 128,
        num_layers: int = 2,
        dropout: float = 0.1,
        max_len: int = 64,
        use_neighbor_char_emb: bool = True,
    ):
        super().__init__()
        self.vocab_size = vocab_size
        self.emb_dim = emb_dim
        self.max_len = max_len
        self.use_neighbor_char_emb = use_neighbor_char_emb

        self.char_emb = nn.Embedding(vocab_size, emb_dim)
        self.pos_emb = nn.Embedding(max_len, pos_dim)
        self.left_emb = nn.Embedding(vocab_size, emb_dim) if use_neighbor_char_emb else None
        self.right_emb = nn.Embedding(vocab_size, emb_dim) if use_neighbor_char_emb else None

        # char + pos + is_first + is_last + norm_len + [left + right emb]
        in_dim = emb_dim + pos_dim + 2 + 1
        if use_neighbor_char_emb:
            in_dim += 2 * emb_dim

        layers: list[nn.Module] = []
        d = in_dim
        for _ in range(num_layers):
            layers.append(nn.Linear(d, hidden_dim))
            layers.append(nn.ReLU(inplace=True))
            layers.append(nn.Dropout(dropout))
            d = hidden_dim
        self.backbone = nn.Sequential(*layers)
        d_h = hidden_dim
        self.lab_head = nn.Linear(d_h, 3)
        self.prom_head = nn.Linear(d_h, 1)
        self.spr_head = nn.Linear(d_h, 1)
        self.boundary_head = nn.Linear(d_h * 2, 1)

    def forward(
        self,
        input_ids: torch.Tensor,
        letter_mask: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        B, T = input_ids.shape
        device = input_ids.device
        char_e = self.char_emb(input_ids)
        pos_idx = torch.arange(T, device=device).clamp(max=self.max_len - 1)
        pos_e = self.pos_emb(pos_idx).unsqueeze(0).expand(B, -1, -1)

        cum = letter_mask.cumsum(dim=1)
        total = letter_mask.sum(dim=1, keepdim=True).clamp(min=1.0)
        is_first = ((cum == 1).float() * letter_mask).unsqueeze(-1)
        is_last = ((cum == total).float() * letter_mask).unsqueeze(-1)
        norm_len = (total / float(self.max_len)).view(B, 1, 1).expand(B, T, 1)

        parts = [char_e, pos_e, is_first, is_last, norm_len]
        if self.use_neighbor_char_emb and self.left_emb is not None and self.right_emb is not None:
            pad = torch.zeros(B, 1, dtype=torch.long, device=device)
            ids_l = torch.cat([pad, input_ids[:, :-1]], dim=1)
            ids_r = torch.cat([input_ids[:, 1:], pad], dim=1)
            parts.append(self.left_emb(ids_l))
            parts.append(self.right_emb(ids_r))

        x = torch.cat(parts, dim=-1)
        out = self.backbone(x)
        pred_lab = self.lab_head(out)
        pred_prom = self.prom_head(out).squeeze(-1)
        pred_spr = self.spr_head(out).squeeze(-1)
        if T < 2:
            pred_boundary = torch.zeros(B, 0, device=device)
        else:
            pair = torch.cat([out[:, :-1], out[:, 1:]], dim=-1)
            pred_boundary = self.boundary_head(pair).squeeze(-1)
        return {
            "pred_lab": pred_lab,
            "pred_prominence": pred_prom,
            "pred_spread": pred_spr,
            "pred_boundary": pred_boundary,
        }
