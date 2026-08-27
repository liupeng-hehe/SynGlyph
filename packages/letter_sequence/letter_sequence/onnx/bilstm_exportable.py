"""BiLSTM variant for ONNX: per-step extra features are tensor inputs (computed in Python)."""

from __future__ import annotations

import torch

from letter_sequence.models.letter_sequence_model import LetterSequenceBiLSTM


class LetterSequenceBiLSTMExportable(LetterSequenceBiLSTM):
    """
    Same weights as LetterSequenceBiLSTM; forward requires precomputed extra_features [B,T,extra_dim].
    """

    def forward(  # type: ignore[override]
        self,
        input_ids: torch.Tensor,
        letter_mask: torch.Tensor,
        extra_features: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        if not (self.use_extra_features and self.extra_dim > 0):
            raise RuntimeError("LetterSequenceBiLSTMExportable requires use_extra_features and extra_dim > 0")
        return super().forward(input_ids, letter_mask, extra_features)

    @classmethod
    def from_bilstm(cls, m: LetterSequenceBiLSTM) -> "LetterSequenceBiLSTMExportable":
        o = cls(
            vocab_size=m.vocab_size,
            emb_dim=m.emb_dim,
            hidden=m.hidden,
            num_layers=m.lstm.num_layers,
            dropout=float(m.lstm.dropout) if m.lstm.num_layers > 1 else 0.0,
            max_len=m.max_len,
            pos_dim=m.pos_emb.embedding_dim,
            extra_dim=m.extra_dim,
            use_extra_features=m.use_extra_features,
            use_word_aggregate=m.use_word_aggregate,
            use_dominant_head=m.dominant_head is not None,
            use_spread_pair_head=m.spr_pair_head is not None,
            word_agg_temperature=m.word_agg_temperature,
        )
        o.load_state_dict(m.state_dict())
        return o
