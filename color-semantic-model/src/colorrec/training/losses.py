"""Loss factory for sentence-transformer training."""

from __future__ import annotations

from typing import Any

from colorrec.inference.encoder import TRAIN_INSTALL_MSG

SUPPORTED_LOSSES = frozenset({"mnrl", "triplet"})


def create_loss(model: Any, loss_name: str) -> Any:
    """Create a sentence-transformers loss from a short name."""
    name = loss_name.strip().lower()
    if name not in SUPPORTED_LOSSES:
        raise ValueError(
            f"Unknown loss {loss_name!r}. Supported: {', '.join(sorted(SUPPORTED_LOSSES))}"
        )

    try:
        from sentence_transformers import losses
    except ImportError as exc:
        raise ImportError(TRAIN_INSTALL_MSG) from exc

    if name == "mnrl":
        return losses.MultipleNegativesRankingLoss(model)
    if name == "triplet":
        return losses.TripletLoss(model)
    raise ValueError(f"Unknown loss {loss_name!r}")
