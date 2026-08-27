"""Chinese Phase 1 canonical dataset: deterministic ids, schema constants, dataset hash."""

from __future__ import annotations

import hashlib
import json
from typing import Any

PRODUCT_LINE = "chinese"
TASK_NAME = "glyph_region_annotation"
SCHEMA_VERSION = "chinese_glyph_dataset_v1"
SOURCE_MODE = "chinese_db"
SPLIT_STRATEGY_FULL_EXPORT = "full_export_v1"
SPLIT_SEED_PLACEHOLDER = 0


def example_id_for_instance(glyph_instance_id: str) -> str:
    """Deterministic id: SHA-256 of product_line|task_name|glyph_instance_id (hex)."""
    key = f"{PRODUCT_LINE}|{TASK_NAME}|{glyph_instance_id}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def compute_dataset_hash(canonical_rows: list[dict[str, Any]]) -> str:
    """Stable SHA-256 over sorted-by-example_id JSON lines (sort_keys, compact separators)."""
    sorted_rows = sorted(canonical_rows, key=lambda r: r.get("example_id", ""))
    payload = json.dumps(sorted_rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
