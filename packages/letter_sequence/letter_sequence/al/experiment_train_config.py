"""Default training configs for AL experiments (simulator + replay)."""

from __future__ import annotations

import json
from typing import Any

from letter_sequence.models.model_factory import normalize_model_family


def default_train_cfg(model_family: str) -> dict[str, Any]:
    fam = normalize_model_family(model_family)
    base: dict[str, Any] = {
        "model_family": fam,
        "data": {"max_seq_len": 64, "train_ratio": 0.8, "split_seed": 42, "split_key": "stimulus_id"},
        "loss_weights": {"lab": 1.0, "prominence": 1.0, "spread": 1.0, "boundary": 1.0},
        "train": {"epochs": 5, "batch_size": 8, "lr": 1e-3, "weight_decay": 1e-4, "device": "cpu"},
    }
    if fam == "bilstm":
        base["model"] = {
            "emb_dim": 64,
            "hidden": 128,
            "num_layers": 1,
            "dropout": 0.1,
            "max_len": 64,
            "pos_dim": 16,
            "use_extra_features": True,
            "extra_dim": 4,
        }
    elif fam == "mlp":
        base["model"] = {
            "emb_dim": 64,
            "pos_dim": 16,
            "hidden_dim": 128,
            "num_layers": 2,
            "dropout": 0.1,
            "max_len": 64,
            "use_neighbor_char_emb": True,
        }
    else:
        base["model"] = {
            "emb_dim": 64,
            "pos_dim": 16,
            "nhead": 4,
            "ff_dim": 256,
            "num_layers": 2,
            "dropout": 0.1,
            "max_len": 64,
            "extra_dim": 4,
            "use_extra_features": True,
        }
    return base


def merge_train_cfg(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    if not override:
        return base
    cfg = json.loads(json.dumps(base))
    for k, v in override.items():
        if k == "model" and isinstance(v, dict):
            cfg["model"] = {**cfg.get("model", {}), **v}
        elif k == "train" and isinstance(v, dict):
            cfg["train"] = {**cfg.get("train", {}), **v}
        elif k == "data" and isinstance(v, dict):
            cfg["data"] = {**cfg.get("data", {}), **v}
        else:
            cfg[k] = v
    return cfg
