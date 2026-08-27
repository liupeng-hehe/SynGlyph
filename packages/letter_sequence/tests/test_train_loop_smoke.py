"""One-epoch train_loop smoke test."""

import json
from pathlib import Path

from letter_sequence.training.train_loop import run_training


def _row(word: str, split: str) -> dict:
    w = word.lower()
    letters = list(w)
    L = len(letters)
    return {
        "schema_version": 2,
        "annotation_id": "a",
        "stimulus_id": "s",
        "word_text": w,
        "letters": letters,
        "raw_input": "|".join(letters),
        "target_lab": [[1.0, 2.0, 3.0]] * L,
        "target_prominence": [0.1] * L,
        "target_spread": [0.2] * L,
        "target_boundary": [0.3] * max(0, L - 1),
        "split": split,
    }


def test_run_training_mlp_one_epoch(tmp_path: Path):
    p = tmp_path / "s.jsonl"
    with p.open("w") as f:
        f.write(json.dumps(_row("cat", "train")) + "\n")
        f.write(json.dumps(_row("dog", "train")) + "\n")
        f.write(json.dumps(_row("hello", "val")) + "\n")

    cfg = {
        "model_family": "mlp",
        "model": {
            "emb_dim": 32,
            "pos_dim": 8,
            "hidden_dim": 64,
            "num_layers": 1,
            "dropout": 0.0,
            "max_len": 32,
            "use_neighbor_char_emb": True,
        },
        "data": {},
        "loss_weights": {"lab": 1.0, "prominence": 1.0, "spread": 1.0, "boundary": 1.0},
        "train": {"epochs": 1, "batch_size": 2, "lr": 1e-3, "weight_decay": 1e-4, "device": "cpu"},
    }
    out = tmp_path / "out"
    m = run_training(samples_jsonl=p, out_dir=out, cfg=cfg, epochs=1)
    assert m.get("model_family") == "mlp"
    assert (out / "letter_sequence.pt").is_file()
    hist = m["history"]
    assert len(hist) == 1
    h0 = hist[0]
    assert "train_loss" in h0 and "val_loss" in h0
    # val_loss uses same multitask definition as train_loss (Smooth L1 + weights).
    assert isinstance(h0["train_loss"], (int, float)) and isinstance(h0["val_loss"], (int, float))
    assert "val_mae_total" in h0
