"""Feature flags for mutating local ML artifacts (export ONNX, parity, etc.)."""

from __future__ import annotations

import os

from app.db import settings


def enable_model_runtime_mutations() -> bool:
    """True when server settings or ENABLE_MODEL_RUNTIME_MUTATIONS=1 / true / yes."""
    if settings.enable_model_runtime_mutations is True:
        return True
    return os.environ.get("ENABLE_MODEL_RUNTIME_MUTATIONS", "").strip() in (
        "1",
        "true",
        "True",
        "yes",
    )
