"""Group K-fold unit tests."""

from __future__ import annotations

import json
from pathlib import Path

from letter_sequence.eval.group_kfold import choose_k, run_group_kfold


def test_choose_k_adaptive():
    assert choose_k(5) is None
    assert choose_k(15) == 3
    assert choose_k(25) == 5


def test_group_kfold_skipped_small_sample(tmp_path: Path):
    jsonl = tmp_path / "samples.jsonl"
    rows = [
        {"word_text": "a", "letters": ["a"], "split": "train", "schema_version": 2,
         "target_lab": [[1, 0, 0]], "target_prominence": [0.5], "target_spread": [0.5], "target_boundary": []},
    ]
    with jsonl.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    cfg = {"model": {"model_family": "bilstm", "emb_dim": 8, "hidden": 8, "num_layers": 1, "dropout": 0.0,
                     "max_len": 8, "pos_dim": 4, "use_extra_features": False, "extra_dim": 0},
           "train": {"batch_size": 1, "lr": 0.01, "device": "cpu"}}
    report = run_group_kfold(jsonl, tmp_path / "cv", cfg, cv_epochs=1, seed=1)
    assert report["status"] == "skipped"
