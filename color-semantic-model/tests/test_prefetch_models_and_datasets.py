"""Offline tests for prefetch_models_and_datasets.py (no network)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import prefetch_models_and_datasets as prefetch  # noqa: E402


def test_build_cache_report_structure() -> None:
    report = prefetch.build_cache_report(
        model_name="fake-model",
        dataset_name="fake/dataset",
        cache_env={"HF_HOME": "/tmp/hf"},
        model_info={"kind": "model", "name": "fake-model", "embedding_dim": 384},
        dataset_info={"kind": "dataset", "name": "fake/dataset", "rows": 10},
    )
    assert report["model_name"] == "fake-model"
    assert report["dataset_name"] == "fake/dataset"
    assert report["cache_env"]["HF_HOME"] == "/tmp/hf"
    assert "timestamp" in report


def test_apply_cache_env_uses_existing_env(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("HF_HOME", str(tmp_path / "custom_hf"))
    monkeypatch.setenv("HF_DATASETS_CACHE", str(tmp_path / "custom_ds"))
    monkeypatch.setenv("TRANSFORMERS_CACHE", str(tmp_path / "custom_tf"))
    env = prefetch._apply_cache_env(tmp_path / "ignored")
    assert env["HF_HOME"] == str(tmp_path / "custom_hf")
    assert env["HF_DATASETS_CACHE"] == str(tmp_path / "custom_ds")
    assert env["TRANSFORMERS_CACHE"] == str(tmp_path / "custom_tf")


def test_run_prefetch_monkeypatched(monkeypatch, tmp_path: Path) -> None:
    def fake_model(model_name: str, *, cache_folder: Path | None = None) -> dict:
        return {
            "kind": "model",
            "name": model_name,
            "embedding_dim": 384,
            "cache_folder": str(cache_folder) if cache_folder else None,
        }

    def fake_dataset(dataset_name: str) -> dict:
        return {
            "kind": "dataset",
            "name": dataset_name,
            "split": "train",
            "rows": 42,
            "columns": ["name", "hex"],
        }

    monkeypatch.setattr(prefetch, "prefetch_model", fake_model)
    monkeypatch.setattr(prefetch, "prefetch_dataset", fake_dataset)

    report = prefetch.run_prefetch(cache_dir=tmp_path / "cache")
    assert report["model"]["embedding_dim"] == 384
    assert report["dataset"]["rows"] == 42
    assert "HF_HOME" in report["cache_env"]


def test_prefetch_model_network_error(monkeypatch) -> None:
    import types

    broken = types.ModuleType("sentence_transformers")

    class BrokenST:
        def __init__(self, *args, **kwargs):
            raise OSError("Network is unreachable")

    broken.SentenceTransformer = BrokenST  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sentence_transformers", broken)

    with pytest.raises(RuntimeError, match="Network unavailable"):
        prefetch.prefetch_model("fake-model")


def test_main_writes_report(monkeypatch, tmp_path: Path, capsys) -> None:
    monkeypatch.setattr(
        prefetch,
        "run_prefetch",
        lambda **kwargs: {"timestamp": "t", "model": {}, "dataset": {}, "cache_env": {}},
    )
    report_path = tmp_path / "cache_report.json"
    monkeypatch.setattr(
        prefetch.sys,
        "argv",
        [
            "prefetch_models_and_datasets.py",
            "--cache_dir",
            str(tmp_path / "cache"),
            "--report",
            str(report_path),
        ],
    )
    exit_code = prefetch.main()
    assert exit_code == 0
    assert report_path.exists()
    data = json.loads(report_path.read_text(encoding="utf-8"))
    assert data["timestamp"] == "t"
    captured = capsys.readouterr()
    assert "timestamp" in captured.out
