"""Diagnostic metadata holdout splits for color_pedia_metadata pairs."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from omegaconf import DictConfig

from colorrec.config import get_path
from colorrec.training.evaluators import load_training_pairs_jsonl as load_pairs_jsonl
from colorrec.schemas import TrainingPair

logger = logging.getLogger(__name__)

METADATA_SOURCE = "color_pedia_metadata"


def _bucket(pair_id: str, seed: int) -> int:
    digest = hashlib.sha256(f"{seed}:{pair_id}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 10


def build_metadata_holdout_pairs(
    train_pairs: list[TrainingPair],
    *,
    seed: int = 42,
) -> tuple[list[TrainingPair], list[TrainingPair], set[str]]:
    """Split color_pedia_metadata pairs into diagnostic val/test holdouts."""
    metadata_pairs = [p for p in train_pairs if p.source == METADATA_SOURCE]
    holdout_val: list[TrainingPair] = []
    holdout_test: list[TrainingPair] = []
    holdout_ids: set[str] = set()

    for pair in metadata_pairs:
        bucket = _bucket(pair.pair_id, seed)
        if bucket == 0:
            holdout_test.append(pair)
            holdout_ids.add(pair.pair_id)
        elif bucket == 1:
            holdout_val.append(pair)
            holdout_ids.add(pair.pair_id)

    return holdout_val, holdout_test, holdout_ids


def ensure_metadata_holdout_files(cfg: DictConfig) -> tuple[Path, Path]:
    """Write metadata holdout jsonl files if missing."""
    val_path = get_path(cfg, "metadata_val_pairs")
    test_path = get_path(cfg, "metadata_test_pairs")
    if val_path.exists() and test_path.exists():
        return val_path, test_path

    train_pairs = load_pairs_jsonl(get_path(cfg, "train_pairs"))
    seed = int(cfg.train.get("seed", cfg.project.get("seed", 42)))
    holdout_val, holdout_test, _ = build_metadata_holdout_pairs(train_pairs, seed=seed)

    val_path.parent.mkdir(parents=True, exist_ok=True)
    with val_path.open("w", encoding="utf-8") as fh:
        for pair in holdout_val:
            fh.write(pair.model_dump_json() + "\n")
    with test_path.open("w", encoding="utf-8") as fh:
        for pair in holdout_test:
            fh.write(pair.model_dump_json() + "\n")

    logger.info(
        "Wrote metadata holdout pairs: val=%d test=%d",
        len(holdout_val),
        len(holdout_test),
    )
    return val_path, test_path


def load_metadata_holdout_pair_ids(cfg: DictConfig) -> set[str]:
    """Return pair_ids reserved for metadata diagnostic holdout."""
    train_pairs = load_pairs_jsonl(get_path(cfg, "train_pairs"))
    seed = int(cfg.train.get("seed", cfg.project.get("seed", 42)))
    _, _, holdout_ids = build_metadata_holdout_pairs(train_pairs, seed=seed)
    return holdout_ids


def metadata_holdout_available(cfg: DictConfig) -> bool:
    """True if metadata holdout can be built from train pairs."""
    try:
        train_path = get_path(cfg, "train_pairs")
    except KeyError:
        return False
    if not train_path.exists():
        return False
    train_pairs = load_pairs_jsonl(train_path)
    return any(p.source == METADATA_SOURCE for p in train_pairs)
