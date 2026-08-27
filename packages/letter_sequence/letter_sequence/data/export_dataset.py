"""Deterministic dataset export helpers (no DB): canonical examples, hash, split, legacy v2."""

from __future__ import annotations

import hashlib
import json
from typing import Any

PRODUCT_LINE = "english"
TASK_NAME = "letter_sequence"
CANONICAL_SCHEMA = "letter_sequence_dataset_v1"
SPLIT_STRATEGY = "stable_hash_v1"


def example_id_stimulus(stimulus_id: str, annotation_id: str, word_text: str) -> str:
    """Deterministic id for stimulus-sourced rows."""
    key = f"{PRODUCT_LINE}|{TASK_NAME}|stimulus|{stimulus_id}|{annotation_id}|{word_text.lower()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def assign_split(example_id: str, split_seed: int, train_ratio: float = 0.8, val_ratio: float = 0.1) -> str:
    """Deterministic train / val / test from example_id and seed."""
    msg = f"{example_id}|{split_seed}".encode("utf-8")
    h = int(hashlib.sha256(msg).hexdigest(), 16)
    r = (h % 10_000) / 10_000.0
    if r < train_ratio:
        return "train"
    if r < train_ratio + val_ratio:
        return "val"
    return "test"


def v2_sample_row_to_canonical(
    row: dict[str, Any],
    *,
    stimulus_id: str,
    annotation_id: str,
    example_id: str,
    split: str,
) -> dict[str, Any]:
    """Build canonical example from legacy v2 training row + ids."""
    word_text = row.get("word_text") or ""
    letters = row.get("letters") or []
    return {
        "example_id": example_id,
        "product_line": PRODUCT_LINE,
        "task_name": TASK_NAME,
        "schema_version": CANONICAL_SCHEMA,
        "word_text": word_text,
        "letters": letters,
        "targets": {
            "lab": row.get("target_lab") or [],
            "prominence": row.get("target_prominence") or [],
            "spread": row.get("target_spread") or [],
            "boundary": row.get("target_boundary") or [],
        },
        "source": {
            "stimulus_id": stimulus_id,
            "annotation_id": annotation_id,
            "feedback_id": None,
            "feedback_applied": False,
        },
        "split": split,
    }


def canonical_to_v2_legacy(canonical: dict[str, Any]) -> dict[str, Any]:
    """Deterministic legacy row for LetterSequenceDataset (schema_version 2)."""
    t = canonical["targets"]
    src = canonical["source"]
    return {
        "schema_version": 2,
        "annotation_id": src.get("annotation_id") or "",
        "stimulus_id": src.get("stimulus_id") or "",
        "word_text": canonical["word_text"],
        "letters": canonical.get("letters") or list(canonical["word_text"].lower()),
        "raw_input": "|".join(canonical.get("letters") or list(canonical["word_text"].lower())),
        "target_lab": t["lab"],
        "target_prominence": t["prominence"],
        "target_spread": t["spread"],
        "target_boundary": t["boundary"],
        "split": canonical["split"],
    }


def compute_dataset_hash(canonical_rows: list[dict[str, Any]]) -> str:
    """Hash sorted canonical rows (by example_id); excludes manifest timestamps."""
    sorted_rows = sorted(canonical_rows, key=lambda r: r["example_id"])
    payload = json.dumps(sorted_rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
