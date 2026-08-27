"""Dataset helpers for sentence-transformer training."""

from __future__ import annotations

import logging
from pathlib import Path

from colorrec.schemas import TrainingPair

logger = logging.getLogger(__name__)


def load_training_pairs_jsonl(path: str | Path) -> list[TrainingPair]:
    """Load training pairs from a JSONL file."""
    pairs: list[TrainingPair] = []
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Training pairs not found at {file_path}")
    with file_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                pairs.append(TrainingPair.model_validate_json(line))
    logger.info("Loaded %d training pairs from %s", len(pairs), file_path)
    return pairs


def make_sentence_transformer_dataset(pairs: list[TrainingPair]):
    """Build a HuggingFace Dataset with anchor/positive columns for MNRL."""
    try:
        from datasets import Dataset
    except ImportError as exc:
        from colorrec.inference.encoder import TRAIN_INSTALL_MSG

        raise ImportError(TRAIN_INSTALL_MSG) from exc

    return Dataset.from_dict(
        {
            "anchor": [p.anchor for p in pairs],
            "positive": [p.positive for p in pairs],
        }
    )


def build_information_retrieval_evaluator(*args, **kwargs):
    """Optional IR evaluator placeholder for future trainer integration."""
    raise NotImplementedError(
        "InformationRetrievalEvaluator is not wired in v1; use evaluate_retrieval after training."
    )
