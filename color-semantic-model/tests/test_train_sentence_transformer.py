"""Tests for sentence-transformer training entrypoint."""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest
from omegaconf import OmegaConf

from colorrec.schemas import TrainingPair
from colorrec.training import train_sentence_transformer as tst


class FakeModel:
    max_seq_length = 128

    def __init__(self, name):
        self.name = name

    def save(self, path):
        Path(path).mkdir(parents=True, exist_ok=True)
        Path(path, "model.txt").write_text("saved", encoding="utf-8")


class FakeTrainer:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def train(self):
        return None


def _write_train_pairs(tmp_path: Path, n: int = 5) -> Path:
    path = tmp_path / "train_pairs.jsonl"
    with path.open("w", encoding="utf-8") as fh:
        for i in range(n):
            pair = TrainingPair(
                pair_id=f"p{i}",
                anchor=f"anchor {i}",
                positive=f"positive {i}",
                positive_color_id=f"c{i}",
                source="xkcd_self",
                weight=1.0,
            )
            fh.write(pair.model_dump_json() + "\n")
    return path


def _cfg(tmp_path: Path, train_path: Path) -> OmegaConf:
    bank = tmp_path / "candidate_colors.parquet"
    import pandas as pd

    pd.DataFrame([{"color_id": "c0", "descriptor": "x"}]).to_parquet(bank, index=False)
    return OmegaConf.create(
        {
            "project": {"seed": 42},
            "model": {"name": "fake-model", "max_seq_length": 128},
            "inference": {"device": "cpu"},
            "train": {
                "model_name": "fake-model",
                "loss": "mnrl",
                "batch_size": 2,
                "epochs": 1,
                "lr": 2e-5,
                "max_train_samples": 3,
                "output_dir": str(tmp_path / "out"),
                "final_model_dir": str(tmp_path / "out" / "final"),
                "seed": 42,
                "use_no_duplicate_sampler": True,
            },
            "paths": {
                "train_pairs": str(train_path),
                "candidate_bank_parquet": str(bank),
            },
        }
    )


def test_train_model_calls_trainer(monkeypatch, tmp_path) -> None:
    train_path = _write_train_pairs(tmp_path, n=5)
    cfg = _cfg(tmp_path, train_path)

    fake_losses = types.SimpleNamespace(MultipleNegativesRankingLoss=lambda model: object(), TripletLoss=lambda model: object())
    fake_st = types.SimpleNamespace(
        SentenceTransformer=FakeModel,
        SentenceTransformerTrainer=FakeTrainer,
        losses=fake_losses,
    )
    fake_training_args = types.SimpleNamespace(
        BatchSamplers=types.SimpleNamespace(NO_DUPLICATES="no_duplicates", BATCH_SAMPLER="batch_sampler"),
        SentenceTransformerTrainingArguments=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_st)
    monkeypatch.setitem(sys.modules, "sentence_transformers.losses", fake_losses)
    monkeypatch.setitem(sys.modules, "sentence_transformers.training_args", fake_training_args)
    monkeypatch.setattr(tst, "load_metadata_holdout_pair_ids", lambda _cfg: set())

    summary = tst.train_model(cfg, model_factory=FakeModel, trainer_factory=FakeTrainer)
    assert summary["raw_train_pairs"] == 3
    assert summary["effective_train_examples"] == 3
    assert summary["train_pairs"] == 3
    assert Path(summary["final_model_dir"], "model.txt").exists()


def test_train_model_applies_weighted_oversampling(monkeypatch, tmp_path) -> None:
    train_path = tmp_path / "train_pairs.jsonl"
    with train_path.open("w", encoding="utf-8") as fh:
        fh.write(
            TrainingPair(
                pair_id="u1",
                anchor="playful summer festival",
                positive="sunny yellow",
                source="user_curated",
                weight=3.5,
            ).model_dump_json()
            + "\n"
        )
        fh.write(
            TrainingPair(
                pair_id="x1",
                anchor="cloud blue",
                positive="blue calm",
                source="xkcd_self",
                weight=1.0,
            ).model_dump_json()
            + "\n"
        )

    cfg = _cfg(tmp_path, train_path)
    cfg.train.max_train_samples = None
    cfg.train.use_weighted_oversampling = True

    fake_losses = types.SimpleNamespace(MultipleNegativesRankingLoss=lambda model: object(), TripletLoss=lambda model: object())
    fake_st = types.SimpleNamespace(
        SentenceTransformer=FakeModel,
        SentenceTransformerTrainer=FakeTrainer,
        losses=fake_losses,
    )
    fake_training_args = types.SimpleNamespace(
        BatchSamplers=types.SimpleNamespace(NO_DUPLICATES="no_duplicates", BATCH_SAMPLER="batch_sampler"),
        SentenceTransformerTrainingArguments=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_st)
    monkeypatch.setitem(sys.modules, "sentence_transformers.losses", fake_losses)
    monkeypatch.setitem(sys.modules, "sentence_transformers.training_args", fake_training_args)
    monkeypatch.setattr(tst, "load_metadata_holdout_pair_ids", lambda _cfg: set())

    summary = tst.train_model(cfg, model_factory=FakeModel, trainer_factory=FakeTrainer)
    assert summary["raw_train_pairs"] == 2
    assert summary["effective_train_examples"] == 5
    assert summary["pairs_by_source_after"]["user_curated"] == 4
    assert summary["user_curated_effective_share"] == pytest.approx(0.8)


def test_build_training_arguments_uses_no_duplicate_sampler(monkeypatch, tmp_path) -> None:
    fake_training_args = types.SimpleNamespace(
        BatchSamplers=types.SimpleNamespace(NO_DUPLICATES="no_duplicates", BATCH_SAMPLER="batch_sampler"),
        SentenceTransformerTrainingArguments=lambda **kwargs: types.SimpleNamespace(**kwargs),
    )
    monkeypatch.setitem(sys.modules, "sentence_transformers.training_args", fake_training_args)
    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "train": {"seed": 42, "use_no_duplicate_sampler": True, "batch_size": 8, "epochs": 1},
        }
    )
    args = tst.build_training_arguments(cfg, tmp_path / "out")
    assert args.batch_sampler == "no_duplicates"


def test_train_model_missing_train_pairs(tmp_path) -> None:
    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "train": {"seed": 42},
            "paths": {
                "train_pairs": str(tmp_path / "missing.jsonl"),
                "candidate_bank_parquet": str(tmp_path / "bank.parquet"),
            },
        }
    )
    with pytest.raises(FileNotFoundError, match="build_training_pairs"):
        tst.prepare_training_pairs(cfg)
