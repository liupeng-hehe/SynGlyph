#!/usr/bin/env python3
"""Build letter_sequence_samples.jsonl + letter_sequence_meta.json from API raw-export JSON."""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import urllib.request
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO / "packages" / "letter_sequence"))

from letter_sequence.data.preprocess_letter_sequences import (  # noqa: E402
    SCHEMA_VERSION,
    SCHEMA_VERSION_3,
    annotation_record_to_sample,
    annotation_record_to_sample_v3,
)

DEFAULT_API = "http://localhost:8000"


def fetch_raw_export(api_base: str, dataset_id: str | None) -> dict:
    q = f"{api_base.rstrip('/')}/api/stimuli/raw-export"
    if dataset_id:
        q += f"?dataset_id={dataset_id}"
    req = urllib.request.Request(q, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def build_samples(data: dict, *, schema_version: int) -> list[dict]:
    stimuli = data.get("stimuli") or []
    annotated = data.get("annotated") or {}
    to_sample = (
        annotation_record_to_sample_v3
        if schema_version >= SCHEMA_VERSION_3
        else annotation_record_to_sample
    )
    out: list[dict] = []
    for stim in stimuli:
        sid = stim["id"]
        ann = annotated.get(sid)
        if not ann:
            continue
        rec = {
            "raw_input": ann.get("raw_input"),
            "spans": ann.get("spans") or [],
            "boundary_influence": ann.get("boundary_influence"),
        }
        sample = to_sample(
            annotation_id=ann["id"],
            stimulus_id=sid,
            word_text=stim.get("text") or "",
            record=rec,
        )
        if sample is None:
            continue
        out.append(sample)
    return out


def assign_splits(samples: list[dict], train_ratio: float, seed: int) -> None:
    """Split by unique stimulus_id so no leakage."""
    by_stim: dict[str, list[dict]] = {}
    for s in samples:
        by_stim.setdefault(s["stimulus_id"], []).append(s)
    ids = list(by_stim.keys())
    rng = random.Random(seed)
    rng.shuffle(ids)
    n_train = int(len(ids) * train_ratio)
    train_ids = set(ids[:n_train])
    for sid in ids:
        split = "train" if sid in train_ids else "val"
        for row in by_stim[sid]:
            row["split"] = split


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-export", type=Path, help="Path to saved raw-export JSON")
    ap.add_argument(
        "--api-url",
        default=os.environ.get("SYNGLYPH_API_URL", DEFAULT_API),
    )
    ap.add_argument("--dataset-id", default=None, help="If set, fetch from API instead of --input-export")
    ap.add_argument(
        "--fetch-global",
        action="store_true",
        help="Fetch /api/stimuli/raw-export without dataset_id (stimuli with no dataset)",
    )
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--train-ratio", type=float, default=0.8)
    ap.add_argument("--split-seed", type=int, default=42)
    ap.add_argument(
        "--schema-version",
        type=int,
        default=SCHEMA_VERSION_3,
        choices=(SCHEMA_VERSION, SCHEMA_VERSION_3),
        help="JSONL schema: 2 legacy, 3 with phonology + aux targets",
    )
    args = ap.parse_args()

    if args.input_export:
        data = json.loads(args.input_export.read_text(encoding="utf-8"))
    elif args.fetch_global:
        data = fetch_raw_export(args.api_url, None)
    elif args.dataset_id is not None:
        data = fetch_raw_export(args.api_url, args.dataset_id)
    else:
        ap.error("Provide --input-export, --dataset-id, or --fetch-global")

    samples = build_samples(data, schema_version=args.schema_version)
    assign_splits(samples, args.train_ratio, args.split_seed)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = args.out_dir / "letter_sequence_samples.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as f:
        for row in samples:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    max_len = max((len(s["letters"]) for s in samples), default=0)
    unique_words = len({s.get("word_text") or "" for s in samples})
    meta = {
        "schema_version": args.schema_version,
        "n_samples": len(samples),
        "n_unique_words": unique_words,
        "n_train": sum(1 for s in samples if s["split"] == "train"),
        "n_val": sum(1 for s in samples if s["split"] == "val"),
        "max_seq_len": max_len,
        "train_ratio": args.train_ratio,
        "split_seed": args.split_seed,
        "samples_path": str(jsonl_path.name),
    }
    (args.out_dir / "letter_sequence_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote {len(samples)} samples to {jsonl_path}")


if __name__ == "__main__":
    main()
