#!/usr/bin/env python3
"""Train a tiny Field net (P/S only) on the same Palette + Field v1 split.

Color stays frozen letter-mean Lab + sparse combo residual.
The net only predicts prominence and spread from letter identity plus
position / vowel-neighbor / collocation features.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence

_SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS))

import eval_palette_field_v1 as v1  # noqa: E402


class FieldNet(nn.Module):
    def __init__(self, feat_dim: int, emb_dim: int = 24, hidden: int = 32, dropout: float = 0.1):
        super().__init__()
        self.char_emb = nn.Embedding(27, emb_dim, padding_idx=0)
        self.feat_proj = nn.Linear(feat_dim, 16)
        self.lstm = nn.LSTM(
            emb_dim + 16,
            hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        d = hidden * 2
        self.drop = nn.Dropout(dropout)
        self.p_head = nn.Linear(d, 1)
        self.s_head = nn.Linear(d, 1)

    def forward(self, char_ids: torch.Tensor, feats: torch.Tensor, lengths: torch.Tensor):
        x = torch.cat([self.char_emb(char_ids), torch.tanh(self.feat_proj(feats))], dim=-1)
        packed = pack_padded_sequence(x, lengths.cpu(), batch_first=True, enforce_sorted=False)
        out, _ = self.lstm(packed)
        h, _ = pad_packed_sequence(out, batch_first=True, total_length=char_ids.size(1))
        h = self.drop(h)
        p = torch.sigmoid(self.p_head(h).squeeze(-1))
        s = torch.sigmoid(self.s_head(h).squeeze(-1))
        return p, s


def char_id(ch: str) -> int:
    return ord(ch) - ord("a") + 1 if "a" <= ch <= "z" else 0


def group_words(tokens: list[dict]) -> list[list[dict]]:
    by: dict[str, list[dict]] = defaultdict(list)
    for t in tokens:
        by[t["word"]].append(t)
    words = []
    for ts in by.values():
        words.append(sorted(ts, key=lambda x: x["i"]))
    return words


def collate(batch: list[list[dict]]) -> dict[str, torch.Tensor]:
    lengths = torch.tensor([len(w) for w in batch], dtype=torch.long)
    t_max = int(lengths.max())
    fdim = len(v1.FEATURE_KEYS)
    ids = torch.zeros(len(batch), t_max, dtype=torch.long)
    feats = torch.zeros(len(batch), t_max, fdim)
    prom = torch.zeros(len(batch), t_max)
    spr = torch.zeros(len(batch), t_max)
    mask = torch.zeros(len(batch), t_max)
    for b, word in enumerate(batch):
        for t, tok in enumerate(word):
            ids[b, t] = char_id(tok["ch"])
            feats[b, t] = torch.tensor(v1.featurize(tok), dtype=torch.float32)
            prom[b, t] = tok["p"]
            spr[b, t] = tok["s"]
            mask[b, t] = 1.0
    return {
        "char_ids": ids,
        "feats": feats,
        "lengths": lengths,
        "prom": prom,
        "spr": spr,
        "mask": mask,
    }


def masked_mse(pred: torch.Tensor, target: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    diff = (pred - target) ** 2 * mask
    return diff.sum() / mask.sum().clamp(min=1.0)


@torch.no_grad()
def predict_tokens(net: FieldNet, words: list[list[dict]], device: torch.device) -> dict[tuple, tuple[float, float]]:
    net.eval()
    out: dict[tuple, tuple[float, float]] = {}
    for i in range(0, len(words), 16):
        chunk = words[i : i + 16]
        batch = collate(chunk)
        p, s = net(
            batch["char_ids"].to(device),
            batch["feats"].to(device),
            batch["lengths"],
        )
        p = p.cpu()
        s = s.cpu()
        for b, word in enumerate(chunk):
            for t, tok in enumerate(word):
                out[(tok["word"], tok["i"])] = (float(p[b, t]), float(s[b, t]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=v1.DEFAULT_DB)
    ap.add_argument("--dataset-id", default=v1.TEST03)
    ap.add_argument("--train-ratio", type=float, default=0.8)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "artifacts" / "palette_field_v1",
    )
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)

    tokens = v1.load_letter_tokens(args.db, args.dataset_id)
    train_words, val_words = v1.split_words(tokens, args.train_ratio, args.seed)
    train = [t for t in tokens if t["word"] in train_words]
    val = [t for t in tokens if t["word"] in val_words]
    train_seq = group_words(train)
    val_seq = group_words(val)

    palette = v1.fit_palette(train)
    combo_res = v1.fit_combo_residual(train, palette)

    device = torch.device("cpu")
    net = FieldNet(feat_dim=len(v1.FEATURE_KEYS)).to(device)
    opt = torch.optim.Adam(net.parameters(), lr=args.lr, weight_decay=1e-4)

    best_state = None
    best_score = float("inf")
    history = []

    for epoch in range(1, args.epochs + 1):
        net.train()
        random.shuffle(train_seq)
        train_loss = 0.0
        n_batches = 0
        for i in range(0, len(train_seq), args.batch_size):
            batch = collate(train_seq[i : i + args.batch_size])
            opt.zero_grad()
            p, s = net(batch["char_ids"].to(device), batch["feats"].to(device), batch["lengths"])
            loss = masked_mse(p, batch["prom"].to(device), batch["mask"].to(device)) + masked_mse(
                s, batch["spr"].to(device), batch["mask"].to(device)
            )
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
            train_loss += float(loss)
            n_batches += 1

        preds = predict_tokens(net, val_seq, device)

        def pred_fn(t: dict):
            p, s = preds[(t["word"], t["i"])]
            return v1.predict_lab(t, palette, combo_res), p, s

        val_m = v1.metrics_for(val, pred_fn)
        score = val_m["mae_prominence"] + val_m["mae_spread"]
        history.append({"epoch": epoch, "train_loss": train_loss / max(n_batches, 1), **val_m})
        if score < best_score:
            best_score = score
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
            print(
                f"epoch {epoch:3d}  loss={history[-1]['train_loss']:.4f}  "
                f"val P={val_m['mae_prominence']:.3f} S={val_m['mae_spread']:.3f}  *",
                flush=True,
            )
        elif epoch % 10 == 0:
            print(
                f"epoch {epoch:3d}  loss={history[-1]['train_loss']:.4f}  "
                f"val P={val_m['mae_prominence']:.3f} S={val_m['mae_spread']:.3f}",
                flush=True,
            )

    assert best_state is not None
    net.load_state_dict(best_state)
    preds_val = predict_tokens(net, val_seq, device)
    preds_train = predict_tokens(net, train_seq, device)

    def pred_net_val(t: dict):
        p, s = preds_val[(t["word"], t["i"])]
        return v1.predict_lab(t, palette, combo_res), p, s

    def pred_net_any(t: dict):
        key = (t["word"], t["i"])
        if key in preds_val:
            p, s = preds_val[key]
        elif key in preds_train:
            p, s = preds_train[key]
        else:
            # unseen orthography: run a singleton batch
            seq = [[t]]
            one = predict_tokens(net, seq, device)
            p, s = one[(t["word"], t["i"])]
        return v1.predict_lab(t, palette, combo_res), p, s

    x_train = [v1.featurize(t) for t in train]
    w_p = v1.fit_linear(x_train, [t["p"] for t in train])
    w_s = v1.fit_linear(x_train, [t["s"] for t in train])

    def pred_linear(t: dict):
        x = v1.featurize(t)
        p = min(1.0, max(0.0, v1.predict_linear(w_p, x)))
        s = min(1.0, max(0.0, v1.predict_linear(w_s, x)))
        return v1.predict_lab(t, palette, combo_res), p, s

    def pred_mean(t: dict):
        lab = palette.get(t["ch"], [50.0, 0.0, 0.0])
        same = [u for u in train if u["ch"] == t["ch"]]
        return lab, v1._mean([u["p"] for u in same] or [0.16]), v1._mean(
            [u["s"] for u in same] or [0.52]
        )

    report = {
        "model": "palette_field_net_v1",
        "split": {
            "seed": args.seed,
            "train_words": len(train_words),
            "val_words": len(val_words),
        },
        "best_epoch_score": best_score,
        "val": {
            "letter_mean_all": v1.metrics_for(val, pred_mean),
            "palette_field_linear": v1.metrics_for(val, pred_linear),
            "palette_field_net": v1.metrics_for(val, pred_net_val),
        },
    }

    val_by_word = defaultdict(list)
    for t in val:
        val_by_word[t["word"]].append(t)
    bilstm = v1.try_bilstm(sorted(val_words), args.api)
    if bilstm:
        lab_mae, de, p_mae, s_mae = [], [], [], []
        used = 0
        for w, toks in val_by_word.items():
            data = bilstm.get(w.lower())
            if not data or len(data["pred_lab"]) != len(toks):
                continue
            used += 1
            toks = sorted(toks, key=lambda x: x["i"])
            for i, t in enumerate(toks):
                lab_mae.append(v1._mean([abs(data["pred_lab"][i][j] - t["lab"][j]) for j in range(3)]))
                de.append(
                    v1._delta_e(
                        data["pred_lab"][i][0] - t["lab"][0],
                        data["pred_lab"][i][1] - t["lab"][1],
                        data["pred_lab"][i][2] - t["lab"][2],
                    )
                )
                p_mae.append(abs(data["pred_prominence"][i] - t["p"]))
                s_mae.append(abs(data["pred_spread"][i] - t["s"]))
        report["val"]["april28_bilstm_api"] = {
            "n_words_scored": used,
            "mae_lab": v1._mae(lab_mae),
            "mae_delta_e": v1._mae(de),
            "mae_prominence": v1._mae(p_mae),
            "mae_spread": v1._mae(s_mae),
        }

    all_by_word = defaultdict(list)
    for t in tokens:
        all_by_word[t["word"]].append(t)
    # ensure example words not in train/val still run through the net
    extra_seq = []
    for w in v1.EXAMPLE_WORDS:
        if w not in all_by_word and w.lower() not in {k.lower() for k in all_by_word}:
            letters = "".join(c for c in w.lower() if c.isalpha())
            syn = []
            n = len(letters)
            for i, ch in enumerate(letters):
                prev = letters[i - 1] if i else None
                nxt = letters[i + 1] if i + 1 < n else None
                pos = "first" if i == 0 else "last" if i == n - 1 else "mid"
                onset = "na"
                if i == 0 and nxt is not None:
                    sv, nv = ch in v1.VOWELS, nxt in v1.VOWELS
                    onset = {True: {True: "VV", False: "VC"}, False: {True: "CV", False: "CC"}}[sv][nv]
                syn.append(
                    {
                        "word": w,
                        "i": i,
                        "ch": ch,
                        "pos": pos,
                        "self_v": ch in v1.VOWELS,
                        "prev": "none" if prev is None else ("V" if prev in v1.VOWELS else "C"),
                        "next": "none" if nxt is None else ("V" if nxt in v1.VOWELS else "C"),
                        "onset": onset,
                        "combo": v1.detect_combo(letters, i),
                        "lab": [50.0, 0.0, 0.0],
                        "p": 0.0,
                        "s": 0.0,
                    }
                )
            extra_seq.append(syn)
            all_by_word[w] = syn
    if extra_seq:
        extra_preds = predict_tokens(net, extra_seq, device)
        preds_val.update(extra_preds)

    examples = [v1.format_word(w, all_by_word, pred_net_any) for w in v1.EXAMPLE_WORDS]
    report["examples"] = examples

    args.out_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = args.out_dir / "field_net.pt"
    torch.save(
        {
            "model_state": best_state,
            "feat_dim": len(v1.FEATURE_KEYS),
            "feature_keys": list(v1.FEATURE_KEYS),
            "palette": palette,
            "combo_residual": combo_res,
            "split": {"seed": args.seed, "train_ratio": args.train_ratio},
        },
        ckpt_path,
    )
    (args.out_dir / "field_net_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (args.out_dir / "field_net_history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")

    print()
    print("Palette + Field net  (held-out words)")
    print(f"{'model':<28} {'LabMAE':>8} {'ΔE':>8} {'P':>8} {'S':>8}")
    rows = [
        ("letter mean (P/S too)", report["val"]["letter_mean_all"]),
        ("palette + linear field", report["val"]["palette_field_linear"]),
        ("palette + field net", report["val"]["palette_field_net"]),
    ]
    if "april28_bilstm_api" in report["val"]:
        rows.append(("April 28 BiLSTM (API)", report["val"]["april28_bilstm_api"]))
    for name, m in rows:
        print(
            f"{name:<28} {m['mae_lab']:8.3f} {m['mae_delta_e']:8.3f} "
            f"{m['mae_prominence']:8.3f} {m['mae_spread']:8.3f}"
        )
    print()
    for ex in examples:
        bits = [
            f"{r['ch']} {r['pred_hex']} P={r['pred_p']:.2f} S={r['pred_s']:.2f}"
            for r in ex["letters"]
        ]
        print(f"  {ex['word']}: " + " | ".join(bits))
    print()
    print(f"wrote {ckpt_path}")


if __name__ == "__main__":
    main()
