#!/usr/bin/env python3
"""Prefetch Hugging Face model weights and datasets for offline HPC runs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_DATASET = "boltuix/color-pedia"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _apply_cache_env(cache_dir: Path | None) -> dict[str, str]:
    """Honor HF_HOME / HF_DATASETS_CACHE / TRANSFORMERS_CACHE when set; else derive from cache_dir."""
    env_snapshot: dict[str, str] = {}
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        hf_home = os.environ.get("HF_HOME", str(cache_dir / "hf_home"))
        datasets_cache = os.environ.get("HF_DATASETS_CACHE", str(cache_dir / "datasets"))
        transformers_cache = os.environ.get("TRANSFORMERS_CACHE", str(cache_dir / "transformers"))
        os.environ.setdefault("HF_HOME", hf_home)
        os.environ.setdefault("HF_DATASETS_CACHE", datasets_cache)
        os.environ.setdefault("TRANSFORMERS_CACHE", transformers_cache)
    for key in ("HF_HOME", "HF_DATASETS_CACHE", "TRANSFORMERS_CACHE"):
        if key in os.environ:
            env_snapshot[key] = os.environ[key]
    return env_snapshot


def _network_error_message(exc: BaseException) -> str:
    return (
        "Network unavailable or Hugging Face download failed. "
        "Run this script on a login node with internet access before submitting Slurm jobs. "
        f"Original error: {exc}"
    )


def prefetch_model(model_name: str, *, cache_folder: Path | None = None) -> dict[str, Any]:
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise RuntimeError(
            "sentence-transformers is required for model prefetch. "
            'Install with: pip install -e ".[train]"'
        ) from exc

    cache = str(cache_folder) if cache_folder else None
    try:
        model = SentenceTransformer(model_name, cache_folder=cache)
        dim = int(model.get_sentence_embedding_dimension())
    except Exception as exc:  # noqa: BLE001 — surface HF/network failures clearly
        raise RuntimeError(_network_error_message(exc)) from exc

    return {
        "kind": "model",
        "name": model_name,
        "embedding_dim": dim,
        "cache_folder": cache,
        "max_seq_length": getattr(model, "max_seq_length", None),
    }


def prefetch_dataset(dataset_name: str) -> dict[str, Any]:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise RuntimeError(
            "datasets is required for dataset prefetch. "
            'Install with: pip install -e ".[color_pedia]"'
        ) from exc

    try:
        ds = load_dataset(dataset_name, split="train")
        row_count = len(ds)
        columns = list(ds.column_names)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(_network_error_message(exc)) from exc

    return {
        "kind": "dataset",
        "name": dataset_name,
        "split": "train",
        "rows": row_count,
        "columns": columns[:20],
    }


def build_cache_report(
    *,
    model_name: str,
    dataset_name: str,
    cache_env: dict[str, str],
    model_info: dict[str, Any],
    dataset_info: dict[str, Any],
) -> dict[str, Any]:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_name": model_name,
        "dataset_name": dataset_name,
        "cache_env": cache_env,
        "model": model_info,
        "dataset": dataset_info,
    }


def run_prefetch(
    *,
    model_name: str = DEFAULT_MODEL,
    dataset_name: str = DEFAULT_DATASET,
    cache_dir: Path | None = None,
) -> dict[str, Any]:
    cache_env = _apply_cache_env(cache_dir)
    model_cache = None
    if cache_dir is not None:
        model_cache = cache_dir / "sentence_transformers"
        model_cache.mkdir(parents=True, exist_ok=True)

    model_info = prefetch_model(model_name, cache_folder=model_cache)
    dataset_info = prefetch_dataset(dataset_name)
    return build_cache_report(
        model_name=model_name,
        dataset_name=dataset_name,
        cache_env=cache_env,
        model_info=model_info,
        dataset_info=dataset_info,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download/cache sentence-transformer model and Color-Pedia dataset for HPC."
    )
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    parser.add_argument("--dataset", type=str, default=DEFAULT_DATASET)
    parser.add_argument(
        "--cache_dir",
        type=str,
        default=None,
        help="Optional local cache root (also respects HF_HOME, HF_DATASETS_CACHE, TRANSFORMERS_CACHE)",
    )
    parser.add_argument(
        "--report",
        type=str,
        default=None,
        help="Optional path to write JSON cache report (default: stdout only)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cache_dir = Path(args.cache_dir).resolve() if args.cache_dir else None
    if cache_dir is None:
        cache_dir = _project_root() / "data" / "cache" / "huggingface"

    try:
        report = run_prefetch(
            model_name=args.model,
            dataset_name=args.dataset,
            cache_dir=cache_dir,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    payload = json.dumps(report, indent=2, ensure_ascii=False)
    print(payload)
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(payload + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
