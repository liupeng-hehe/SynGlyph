#!/usr/bin/env python3
"""Palette + Field v1 calculation on Test_03 annotations.

Color = train-set letter-mean Lab, plus a sparse combo residual for
th/sh/wh/gh. Prominence / spread = linear model on position, vowel/consonant
context, onset shape, and collocation id.

Word-level 80/20 split (no letter leakage across the same word).
Optionally compares against a running letter-sequence API.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sqlite3
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

VOWELS = set("aeiouy")
COMBOS = ("th", "sh", "ch", "wh", "ph", "gh", "ck", "ng", "qu", "tion")
COLOR_COMBOS = ("th", "sh", "wh", "gh")
DEFAULT_DB = Path("/Users/lvmeizhong/Desktop/SynGlyph/apps/api/synglyph.db")
TEST03 = "37518a31-d2f8-40f5-a1a0-492a921b2448"
EXAMPLE_WORDS = ("wonder", "wander", "think", "ship", "synesthesia", "thing", "under")


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _mae(xs: list[float]) -> float:
    return _mean([abs(x) for x in xs])


def _delta_e(dl: float, da: float, db: float) -> float:
    return math.sqrt(dl * dl + da * da + db * db)


def detect_combo(word: str, i: int) -> str | None:
    n = len(word)
    left = word[i - 1] + word[i] if i > 0 else ""
    right = word[i] + word[i + 1] if i + 1 < n else ""
    for d in COMBOS:
        if len(d) == 2 and d in (left, right):
            return d
        if len(d) > 2:
            idx = word.find(d)
            if idx != -1 and idx <= i < idx + len(d):
                return d
    return None


def load_letter_tokens(db_path: Path, dataset_id: str) -> list[dict]:
    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        """
        SELECT s.text AS word, sp.span_text, sp.color_lab_l, sp.color_lab_a, sp.color_lab_b,
               sp.prominence, sp.spread
        FROM span sp
        JOIN segmentation sg ON sp.segmentation_id = sg.id
        JOIN annotation a ON sg.annotation_id = a.id
        JOIN stimulus s ON a.stimulus_id = s.id
        WHERE s.dataset_id = ?
        """,
        (dataset_id,),
    ).fetchall()
    conn.close()

    by_word: dict[str, list[tuple]] = defaultdict(list)
    for word, span, L, a, b, p, s in rows:
        if span and len(span) == 1 and span.isalpha():
            by_word[word].append(
                (
                    span.lower(),
                    float(L if L is not None else 50.0),
                    float(a if a is not None else 0.0),
                    float(b if b is not None else 0.0),
                    float(p if p is not None else 0.5),
                    float(s if s is not None else 0.5),
                )
            )

    tokens: list[dict] = []
    for word, occs in by_word.items():
        w = "".join(c for c in word.lower() if c.isalpha())
        chars = [o[0] for o in occs]
        if len(occs) != len(w) or "".join(chars) != w:
            continue
        n = len(occs)
        for i, (ch, L, a, b, p, s) in enumerate(occs):
            prev = w[i - 1] if i else None
            nxt = w[i + 1] if i + 1 < n else None
            pos = "first" if i == 0 else "last" if i == n - 1 else "mid"
            onset = "na"
            if i == 0 and nxt is not None:
                sv, nv = ch in VOWELS, nxt in VOWELS
                onset = {True: {True: "VV", False: "VC"}, False: {True: "CV", False: "CC"}}[sv][nv]
            tokens.append(
                {
                    "word": word,
                    "i": i,
                    "ch": ch,
                    "pos": pos,
                    "self_v": ch in VOWELS,
                    "prev": "none" if prev is None else ("V" if prev in VOWELS else "C"),
                    "next": "none" if nxt is None else ("V" if nxt in VOWELS else "C"),
                    "onset": onset,
                    "combo": detect_combo(w, i),
                    "lab": [L, a, b],
                    "p": p,
                    "s": s,
                }
            )
    return tokens


def split_words(tokens: list[dict], train_ratio: float, seed: int) -> tuple[set[str], set[str]]:
    words = sorted({t["word"] for t in tokens})
    rng = random.Random(seed)
    rng.shuffle(words)
    n_train = max(1, int(round(len(words) * train_ratio)))
    train = set(words[:n_train])
    val = set(words[n_train:]) or set(words[-1:])
    return train, val


FEATURE_KEYS = (
    [f"pos={x}" for x in ("first", "mid", "last")]
    + ["self_v"]
    + [f"prev={x}" for x in ("none", "V", "C")]
    + [f"next={x}" for x in ("none", "V", "C")]
    + [f"onset={x}" for x in ("CV", "CC", "VC", "VV", "na")]
    + [f"combo={x}" for x in COMBOS]
    + ["combo=none"]
)


def featurize(t: dict) -> list[float]:
    flags = {
        f"pos={t['pos']}": 1.0,
        "self_v": 1.0 if t["self_v"] else 0.0,
        f"prev={t['prev']}": 1.0,
        f"next={t['next']}": 1.0,
        f"onset={t['onset']}": 1.0,
        f"combo={t['combo'] or 'none'}": 1.0,
    }
    return [flags.get(k, 0.0) for k in FEATURE_KEYS]


def fit_linear(xs: list[list[float]], ys: list[float]) -> list[float]:
    n = len(xs)
    k = len(xs[0])
    # intercept
    a = [[1.0] + row for row in xs]
    # normal equation with light ridge
    lam = 1e-2
    ata = [[0.0] * (k + 1) for _ in range(k + 1)]
    atb = [0.0] * (k + 1)
    for i in range(n):
        for p in range(k + 1):
            atb[p] += a[i][p] * ys[i]
            for q in range(k + 1):
                ata[p][q] += a[i][p] * a[i][q]
    for p in range(k + 1):
        ata[p][p] += lam
    return _solve(ata, atb)


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        div = m[col][col] if abs(m[col][col]) > 1e-12 else 1e-12
        for j in range(col, n + 1):
            m[col][j] /= div
        for r in range(n):
            if r == col:
                continue
            f = m[r][col]
            for j in range(col, n + 1):
                m[r][j] -= f * m[col][j]
    return [m[i][n] for i in range(n)]


def predict_linear(w: list[float], x: list[float]) -> float:
    return w[0] + sum(wj * xj for wj, xj in zip(w[1:], x))


def fit_palette(train: list[dict]) -> dict[str, list[float]]:
    buckets: dict[str, list[list[float]]] = defaultdict(list)
    for t in train:
        buckets[t["ch"]].append(t["lab"])
    out = {}
    for ch, labs in buckets.items():
        out[ch] = [_mean([lab[i] for lab in labs]) for i in range(3)]
    return out


def fit_combo_residual(
    train: list[dict], palette: dict[str, list[float]]
) -> dict[str, list[float]]:
    buckets: dict[str, list[list[float]]] = defaultdict(list)
    for t in train:
        c = t["combo"]
        if c not in COLOR_COMBOS:
            continue
        base = palette.get(t["ch"], [50.0, 0.0, 0.0])
        buckets[c].append([t["lab"][i] - base[i] for i in range(3)])
    out = {}
    for c, rs in buckets.items():
        if len(rs) < 4:
            continue
        out[c] = [_mean([r[i] for r in rs]) for i in range(3)]
    return out


def predict_lab(
    t: dict, palette: dict[str, list[float]], combo_res: dict[str, list[float]]
) -> list[float]:
    base = palette.get(t["ch"], [50.0, 0.0, 0.0])
    extra = combo_res.get(t["combo"] or "", [0.0, 0.0, 0.0])
    return [base[i] + extra[i] for i in range(3)]


def metrics_for(tokens: list[dict], pred_fn) -> dict[str, float]:
    lab_mae, de, p_mae, s_mae = [], [], [], []
    for t in tokens:
        lab, p, s = pred_fn(t)
        lab_mae.append(_mean([abs(lab[i] - t["lab"][i]) for i in range(3)]))
        de.append(_delta_e(lab[0] - t["lab"][0], lab[1] - t["lab"][1], lab[2] - t["lab"][2]))
        p_mae.append(abs(p - t["p"]))
        s_mae.append(abs(s - t["s"]))
    return {
        "n_letters": len(tokens),
        "n_words": len({t["word"] for t in tokens}),
        "mae_lab": _mae(lab_mae),
        "mae_delta_e": _mae(de),
        "mae_prominence": _mae(p_mae),
        "mae_spread": _mae(s_mae),
    }


def try_bilstm(words: list[str], api: str) -> dict[str, dict] | None:
    out = {}
    for w in words:
        try:
            req = urllib.request.Request(
                f"{api.rstrip('/')}/api/letter-sequence/predict-text",
                data=json.dumps({"text": w}).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode())
            letters = "".join(c for c in w.lower() if c.isalpha())
            if len(data.get("pred_lab") or []) != len(letters):
                continue
            out[w.lower()] = data
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
            return None
    return out or None


def lab_to_hex(L: float, a: float, b: float) -> str:
    fy = (L + 16) / 116
    fx = a / 500 + fy
    fz = fy - b / 200

    def f(t: float) -> float:
        return t**3 if t**3 > 0.008856 else (t - 16 / 116) / 7.787

    X, Y, Z = f(fx) * 95.047, f(fy) * 100.0, f(fz) * 108.883
    X, Y, Z = X / 100.0, Y / 100.0, Z / 100.0
    r = X * 3.2406 + Y * -1.5372 + Z * -0.4986
    g = X * -0.9689 + Y * 1.8758 + Z * 0.0415
    b2 = X * 0.0557 + Y * -0.2040 + Z * 1.0570

    def g2(c: float) -> int:
        c = max(0.0, min(1.0, c))
        v = 1.055 * c ** (1 / 2.4) - 0.055 if c > 0.0031308 else 12.92 * c
        return int(round(v * 255))

    return f"#{g2(r):02X}{g2(g):02X}{g2(b2):02X}"


def format_word(word: str, tokens_by_word: dict[str, list[dict]], pred_fn) -> dict:
    toks = tokens_by_word.get(word) or tokens_by_word.get(word.lower())
    letters = "".join(c for c in word.lower() if c.isalpha())
    if not toks:
        # synthesize feature rows from orthography only (no gold)
        w = letters
        syn = []
        n = len(w)
        for i, ch in enumerate(w):
            prev = w[i - 1] if i else None
            nxt = w[i + 1] if i + 1 < n else None
            pos = "first" if i == 0 else "last" if i == n - 1 else "mid"
            onset = "na"
            if i == 0 and nxt is not None:
                sv, nv = ch in VOWELS, nxt in VOWELS
                onset = {True: {True: "VV", False: "VC"}, False: {True: "CV", False: "CC"}}[sv][nv]
            syn.append(
                {
                    "word": word,
                    "i": i,
                    "ch": ch,
                    "pos": pos,
                    "self_v": ch in VOWELS,
                    "prev": "none" if prev is None else ("V" if prev in VOWELS else "C"),
                    "next": "none" if nxt is None else ("V" if nxt in VOWELS else "C"),
                    "onset": onset,
                    "combo": detect_combo(w, i),
                    "lab": [None, None, None],
                    "p": None,
                    "s": None,
                }
            )
        toks = syn
    rows = []
    for t in toks:
        lab, p, s = pred_fn(t)
        row = {
            "ch": t["ch"],
            "pred_hex": lab_to_hex(*lab),
            "pred_lab": [round(x, 2) for x in lab],
            "pred_p": round(p, 3),
            "pred_s": round(s, 3),
            "combo": t["combo"],
            "pos": t["pos"],
        }
        if t.get("p") is not None:
            row["gold_p"] = round(t["p"], 3)
            row["gold_s"] = round(t["s"], 3)
            row["gold_hex"] = lab_to_hex(*t["lab"])
        rows.append(row)
    return {"word": word, "letters": rows}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--dataset-id", default=TEST03)
    ap.add_argument("--train-ratio", type=float, default=0.8)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "artifacts" / "palette_field_v1",
    )
    args = ap.parse_args()

    if not args.db.is_file():
        print(f"DB not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    tokens = load_letter_tokens(args.db, args.dataset_id)
    train_words, val_words = split_words(tokens, args.train_ratio, args.seed)
    train = [t for t in tokens if t["word"] in train_words]
    val = [t for t in tokens if t["word"] in val_words]

    palette = fit_palette(train)
    combo_res = fit_combo_residual(train, palette)
    x_train = [featurize(t) for t in train]
    w_p = fit_linear(x_train, [t["p"] for t in train])
    w_s = fit_linear(x_train, [t["s"] for t in train])

    def pred_palette_only(t: dict):
        lab = palette.get(t["ch"], [50.0, 0.0, 0.0])
        return lab, _mean([u["p"] for u in train if u["ch"] == t["ch"]] or [0.16]), _mean(
            [u["s"] for u in train if u["ch"] == t["ch"]] or [0.52]
        )

    def pred_v1(t: dict):
        x = featurize(t)
        p = min(1.0, max(0.0, predict_linear(w_p, x)))
        s = min(1.0, max(0.0, predict_linear(w_s, x)))
        return predict_lab(t, palette, combo_res), p, s

    def pred_pos_only(t: dict):
        lab = palette.get(t["ch"], [50.0, 0.0, 0.0])
        same = [u for u in train if u["pos"] == t["pos"]]
        return lab, _mean([u["p"] for u in same]), _mean([u["s"] for u in same])

    report = {
        "dataset_id": args.dataset_id,
        "n_aligned_words": len({t["word"] for t in tokens}),
        "n_aligned_letters": len(tokens),
        "split": {
            "seed": args.seed,
            "train_ratio": args.train_ratio,
            "train_words": len(train_words),
            "val_words": len(val_words),
            "train_letters": len(train),
            "val_letters": len(val),
        },
        "palette_letters": sorted(palette.keys()),
        "combo_residual": {
            k: [round(x, 2) for x in v] for k, v in combo_res.items()
        },
        "val": {
            "letter_mean_all": metrics_for(val, pred_palette_only),
            "palette_plus_position": metrics_for(val, pred_pos_only),
            "palette_field_v1": metrics_for(val, pred_v1),
        },
        "train_palette_field_v1": metrics_for(train, pred_v1),
    }

    val_by_word = defaultdict(list)
    for t in val:
        val_by_word[t["word"]].append(t)
    all_by_word = defaultdict(list)
    for t in tokens:
        all_by_word[t["word"]].append(t)

    bilstm = try_bilstm(sorted(val_words), args.api)
    if bilstm:
        lab_mae, de, p_mae, s_mae = [], [], [], []
        used = 0
        for w, toks in val_by_word.items():
            key = "".join(c for c in w.lower() if c.isalpha())
            data = bilstm.get(w.lower()) or bilstm.get(key)
            if not data:
                continue
            labs, ps, ss = data["pred_lab"], data["pred_prominence"], data["pred_spread"]
            if len(labs) != len(toks):
                continue
            used += 1
            for i, t in enumerate(toks):
                lab_mae.append(_mean([abs(labs[i][j] - t["lab"][j]) for j in range(3)]))
                de.append(
                    _delta_e(
                        labs[i][0] - t["lab"][0],
                        labs[i][1] - t["lab"][1],
                        labs[i][2] - t["lab"][2],
                    )
                )
                p_mae.append(abs(ps[i] - t["p"]))
                s_mae.append(abs(ss[i] - t["s"]))
        report["val"]["april28_bilstm_api"] = {
            "n_words_scored": used,
            "mae_lab": _mae(lab_mae),
            "mae_delta_e": _mae(de),
            "mae_prominence": _mae(p_mae),
            "mae_spread": _mae(s_mae),
        }

    examples = [format_word(w, all_by_word, pred_v1) for w in EXAMPLE_WORDS]
    report["examples"] = examples

    args.out_dir.mkdir(parents=True, exist_ok=True)
    palette_hex = {ch: lab_to_hex(*lab) for ch, lab in sorted(palette.items())}
    (args.out_dir / "palette.json").write_text(
        json.dumps({"lab": palette, "hex": palette_hex, "combo_residual": combo_res}, indent=2),
        encoding="utf-8",
    )
    (args.out_dir / "field_weights.json").write_text(
        json.dumps(
            {
                "feature_keys": FEATURE_KEYS,
                "prominence": w_p,
                "spread": w_s,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (args.out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    v = report["val"]
    print("Palette + Field v1  (held-out words)")
    print(f"  aligned {report['n_aligned_words']} words / {report['n_aligned_letters']} letters")
    print(f"  split   train {report['split']['train_words']} words, val {report['split']['val_words']} words")
    print()
    rows = [
        ("letter mean (P/S too)", v["letter_mean_all"]),
        ("palette + position", v["palette_plus_position"]),
        ("palette + field v1", v["palette_field_v1"]),
    ]
    if "april28_bilstm_api" in v:
        rows.append(("April 28 BiLSTM (API)", v["april28_bilstm_api"]))
    print(f"{'model':<28} {'LabMAE':>8} {'ΔE':>8} {'P':>8} {'S':>8}")
    for name, m in rows:
        print(
            f"{name:<28} {m['mae_lab']:8.3f} {m['mae_delta_e']:8.3f} "
            f"{m['mae_prominence']:8.3f} {m['mae_spread']:8.3f}"
        )
    print()
    print("Combo residuals used:", ", ".join(combo_res) or "(none, too few train hits)")
    print()
    for ex in examples:
        bits = [
            f"{r['ch']} {r['pred_hex']} P={r['pred_p']:.2f} S={r['pred_s']:.2f}"
            for r in ex["letters"]
        ]
        print(f"  {ex['word']}: " + " | ".join(bits))
    print()
    print(f"wrote {args.out_dir}")


if __name__ == "__main__":
    main()
