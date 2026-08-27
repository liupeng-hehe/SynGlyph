"""Text encoder helpers for baseline retrieval."""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Protocol, Sequence

import numpy as np
from omegaconf import DictConfig

from colorrec.config import resolve_path

logger = logging.getLogger(__name__)

TRAIN_INSTALL_MSG = "Please install with pip install -e '.[train]'"


class TextEncoder(Protocol):
    def encode(
        self,
        sentences: Sequence[str],
        batch_size: int = 32,
        normalize_embeddings: bool = True,
        show_progress_bar: bool = False,
    ) -> np.ndarray: ...


def resolve_device(device_cfg: str = "auto") -> str:
    if device_cfg and device_cfg != "auto":
        return device_cfg
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_encoder(
    cfg: DictConfig,
    *,
    model_path: str | None = None,
) -> TextEncoder:
    """Load a sentence-transformer encoder from config."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise ImportError(TRAIN_INSTALL_MSG) from exc

    model_name = model_path or str(cfg.model.name)
    cache_dir = cfg.model.get("cache_dir")
    cache_path = str(resolve_path(str(cache_dir))) if cache_dir else None
    device = resolve_device(str(cfg.inference.get("device", "auto")))
    max_seq_length = int(cfg.model.get("max_seq_length", 128))

    logger.info("Loading encoder %s on %s", model_name, device)
    model = SentenceTransformer(model_name, cache_folder=cache_path, device=device)
    model.max_seq_length = max_seq_length
    return model


class FakeEncoder:
    """Deterministic toy encoder for offline tests."""

    def __init__(self, dim: int = 32) -> None:
        self.dim = dim

    def encode(
        self,
        sentences: Sequence[str],
        batch_size: int = 32,
        normalize_embeddings: bool = True,
        show_progress_bar: bool = False,
    ) -> np.ndarray:
        del batch_size, show_progress_bar
        vectors: list[np.ndarray] = []
        for text in sentences:
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            arr = np.frombuffer(digest * ((self.dim // len(digest)) + 1), dtype=np.uint8)[: self.dim].astype(
                np.float32
            )
            if normalize_embeddings:
                norm = np.linalg.norm(arr)
                if norm > 0:
                    arr = arr / norm
            vectors.append(arr)
        return np.stack(vectors, axis=0)
