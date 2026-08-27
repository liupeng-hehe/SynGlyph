"""Canonical model_family dispatch: mlp | bilstm."""

from __future__ import annotations

import torch.nn as nn

# Lazy-import concrete classes inside build_model to avoid circular imports with letter_sequence_model.

CANONICAL_FAMILIES = frozenset({"mlp", "bilstm"})

_LEGACY_ALIASES: dict[str, str] = {
    "letter_sequence_bilstm": "bilstm",
    "letter_sequence_mlp": "mlp",
    # transformer checkpoints revert to bilstm (superior for short sequences)
    "transformer_encoder": "bilstm",
    "letter_sequence_transformer_encoder": "bilstm",
}


def normalize_model_family(model_family: str | None) -> str:
    """Map legacy ids to canonical; default missing -> bilstm."""
    if model_family is None or (isinstance(model_family, str) and not model_family.strip()):
        return "bilstm"
    s = model_family.strip()
    if s in _LEGACY_ALIASES:
        return _LEGACY_ALIASES[s]
    if s in CANONICAL_FAMILIES:
        return s
    return "bilstm"


def build_model(cfg: dict) -> nn.Module:
    """Build model from checkpoint / train config dict."""
    fam = normalize_model_family(cfg.get("model_family"))
    cfg = {**cfg, "model_family": fam}

    if fam == "bilstm":
        from letter_sequence.models.letter_sequence_model import LetterSequenceBiLSTM

        use_ex = cfg.get("use_extra_features", True)
        ed = cfg.get("extra_dim", 16) if use_ex else 0
        hcfg = cfg.get("heads", {}) or {}
        return LetterSequenceBiLSTM(
            emb_dim=cfg.get("emb_dim", 64),
            hidden=cfg.get("hidden", cfg.get("hidden_size", 128)),
            num_layers=cfg.get("num_layers", 1),
            dropout=cfg.get("dropout", 0.1),
            max_len=cfg.get("max_len", 64),
            pos_dim=cfg.get("pos_dim", 16),
            extra_dim=ed,
            use_extra_features=use_ex,
            use_word_aggregate=bool(cfg.get("use_word_aggregate", True)),
            use_dominant_head=bool(hcfg.get("dominant_letter", True)),
            use_spread_pair_head=bool(hcfg.get("spread_pair", True)),
            word_agg_temperature=float((cfg.get("word_aggregate") or {}).get("temperature", 1.0)),
        )

    if fam == "mlp":
        from letter_sequence.models.letter_sequence_mlp import LetterSequenceMLP

        return LetterSequenceMLP(
            emb_dim=cfg.get("emb_dim", 64),
            pos_dim=cfg.get("pos_dim", 16),
            hidden_dim=cfg.get("hidden_dim", cfg.get("hidden", 128)),
            num_layers=cfg.get("num_layers", 2),
            dropout=cfg.get("dropout", 0.1),
            max_len=cfg.get("max_len", 64),
            use_neighbor_char_emb=cfg.get("use_neighbor_char_emb", True),
        )

    raise ValueError(f"unknown model_family after normalize: {fam}")
