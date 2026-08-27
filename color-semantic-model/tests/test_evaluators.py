"""Tests for training dataset helpers."""

from __future__ import annotations

from colorrec.schemas import TrainingPair
from colorrec.training.evaluators import load_training_pairs_jsonl, make_sentence_transformer_dataset


def test_load_training_pairs_jsonl(tmp_path) -> None:
    path = tmp_path / "train.jsonl"
    pair = TrainingPair(
        pair_id="p1",
        anchor="warm orange",
        positive="warm orange descriptor",
        positive_color_id="c1",
        source="xkcd_self",
        weight=1.0,
    )
    path.write_text(pair.model_dump_json() + "\n", encoding="utf-8")
    loaded = load_training_pairs_jsonl(path)
    assert len(loaded) == 1
    assert loaded[0].anchor == "warm orange"


def test_make_sentence_transformer_dataset() -> None:
    pairs = [
        TrainingPair(
            pair_id="p1",
            anchor="a",
            positive="b",
            source="xkcd_self",
            weight=1.0,
        )
    ]
    ds = make_sentence_transformer_dataset(pairs)
    assert ds.column_names == ["anchor", "positive"]
    assert ds[0]["anchor"] == "a"
