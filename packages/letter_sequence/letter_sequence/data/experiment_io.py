"""Load frozen canonical examples and write temporary legacy JSONL (does not mutate Phase 1 dataset dirs)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from letter_sequence.data.export_dataset import canonical_to_v2_legacy
from letter_sequence.paths import dataset_version_dir


def load_canonical_examples(examples_jsonl: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with examples_jsonl.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def examples_to_legacy_jsonl_path(
    examples: list[dict[str, Any]],
    out_path: Path,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for c in examples:
            f.write(json.dumps(canonical_to_v2_legacy(c), ensure_ascii=False) + "\n")


def filter_examples_by_ids(
    examples: list[dict[str, Any]],
    ids: Iterable[str],
) -> list[dict[str, Any]]:
    want = set(ids)
    return [e for e in examples if e.get("example_id") in want]


def resolve_dataset_paths(dataset_version_id: str) -> dict[str, Path]:
    """Paths under artifacts/datasets/{id}/."""
    base = dataset_version_dir(dataset_version_id)
    return {
        "dataset_version_id": dataset_version_id,
        "examples_jsonl": base / "examples.jsonl",
        "letter_sequence_samples_jsonl": base / "letter_sequence_samples.jsonl",
        "manifest_json": base / "manifest.json",
    }
