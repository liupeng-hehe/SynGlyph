"""Ensure HPC v2 configs use isolated artifact paths."""

from __future__ import annotations

from colorrec.config import load_config, resolve_path


def _path(cfg, key: str) -> str:
    return str(cfg.paths[key])


def test_hpc_v2_paths_isolated_from_full_train_v2() -> None:
    local = load_config(resolve_path("configs/full_train_v2.yaml"))
    hpc = load_config(resolve_path("configs/hpc_v2.yaml"))

    local_paths = {
        _path(local, "fine_tuned_candidate_embeddings"),
        _path(local, "fine_tuned_retrieval_json"),
        _path(local, "compare_report_md"),
    }
    hpc_paths = {
        _path(hpc, "fine_tuned_candidate_embeddings"),
        _path(hpc, "fine_tuned_retrieval_json"),
        _path(hpc, "compare_report_md"),
    }
    assert local_paths.isdisjoint(hpc_paths)
    assert "hpc_v2" in _path(hpc, "fine_tuned_retrieval_json")
    assert "full_v2" not in _path(hpc, "fine_tuned_retrieval_json")


def test_hpc_v2_inherits_base_project() -> None:
    cfg = load_config(resolve_path("configs/hpc_v2.yaml"))
    assert cfg.project.seed == 42
    assert "name" in cfg.model


def test_hpc_v2_train_settings() -> None:
    cfg = load_config(resolve_path("configs/hpc_v2.yaml"))
    assert cfg.train.batch_size == 64
    assert cfg.train.epochs == 3
    assert cfg.train.fp16 is True
    assert cfg.train.max_train_samples is None
    assert cfg.train.use_weighted_oversampling is True
    assert "hpc_color_sentence_transformer_v2" in str(cfg.train.output_dir)
    assert str(cfg.train.final_model_dir).endswith("/final")


def test_hpc_v2_smoke_paths_isolated_from_hpc_v2_full() -> None:
    full = load_config(resolve_path("configs/hpc_v2.yaml"))
    smoke = load_config(resolve_path("configs/hpc_v2_smoke.yaml"))

    full_paths = {
        _path(full, "fine_tuned_candidate_embeddings"),
        _path(full, "fine_tuned_retrieval_json"),
        _path(full, "compare_report_md"),
        str(full.train.output_dir),
        str(full.train.final_model_dir),
    }
    smoke_paths = {
        _path(smoke, "fine_tuned_candidate_embeddings"),
        _path(smoke, "fine_tuned_retrieval_json"),
        _path(smoke, "compare_report_md"),
        str(smoke.train.output_dir),
        str(smoke.train.final_model_dir),
    }
    assert full_paths.isdisjoint(smoke_paths)
    assert "hpc_v2_smoke" in _path(smoke, "fine_tuned_retrieval_json")


def test_hpc_v2_smoke_train_settings() -> None:
    cfg = load_config(resolve_path("configs/hpc_v2_smoke.yaml"))
    assert cfg.project.seed == 42
    assert cfg.train.max_train_samples == 512
    assert cfg.train.epochs == 1
    assert cfg.train.batch_size == 32
    assert "hpc_color_sentence_transformer_v2_smoke" in str(cfg.train.output_dir)
