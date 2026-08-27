#!/usr/bin/env python3
"""Use OpenAI as a teacher to enrich fixed HEX colors with descriptions and anchors.

The model is NOT allowed to change the HEX. Outputs:
- enriched palette CSV: one descriptor per color
- enriched pairs CSV: multiple anchor_text rows per color
- audit JSONL: raw response per batch for review / resume
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions"

PAIR_HEADER = [
    "anchor_text",
    "positive_color_name",
    "positive_hex",
    "positive_descriptor",
    "color_family",
    "weight",
]

PALETTE_HEADER = ["name", "hex", "family", "descriptor", "keywords", "weight"]

SYSTEM_PROMPT = """You are a synesthetic color designer creating supervised training data.

You receive a batch of fixed colors. For EACH input color:
- Keep the exact input "hex". Do not alter, approximate, or invent a replacement.
- Write an evocative but concise "color_name" (2-5 words).
- Write a "description" for a readable PDF / literary passage background. It should sound like a strong designer recommendation, not a template.
- Write 4 "anchors": short user query phrases that should retrieve this color. Vary the language: metaphor, material, mood, scene.
- Write "mood_tags": 4-7 lowercase words.
- Write a brief "reason" tying hue, lightness/chroma, and emotional use.

Return ONLY JSON:
{
  "items": [
    {
      "hex": "#RRGGBB",
      "color_name": "...",
      "description": "...",
      "anchors": ["...", "...", "...", "..."],
      "mood_tags": ["...", "..."],
      "reason": "..."
    }
  ]
}
"""


def load_env_key(env_files: list[Path]) -> str:
    if os.environ.get("OPENAI_API_KEY", "").strip():
        return os.environ["OPENAI_API_KEY"].strip()
    for path in env_files:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "OPENAI_API_KEY":
                return value.strip().strip('"').strip("'")
    return ""


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def append_audit(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def parse_json_loose(raw: str) -> dict[str, Any]:
    text = raw.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        parsed = json.loads(text[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("OpenAI response did not contain a JSON object")


def call_openai_batch(
    *,
    api_key: str,
    colors: list[dict[str, str]],
    model: str,
    temperature: float,
) -> dict[str, Any]:
    compact = [
        {
            "hex": row["hex"],
            "family": row.get("family", ""),
            "current_name": row.get("name", ""),
            "current_descriptor": row.get("descriptor", "")[:260],
            "keywords": row.get("keywords", "")[:160],
        }
        for row in colors
    ]
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Enrich these fixed colors:\n" + json.dumps(compact, ensure_ascii=False),
            },
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        OPENAI_CHAT_COMPLETIONS,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {detail}") from exc
    raw = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not raw:
        raise RuntimeError("OpenAI returned empty content")
    return parse_json_loose(str(raw))


def clean_hex(raw: str) -> str:
    value = (raw or "").strip().upper()
    if value and not value.startswith("#"):
        value = f"#{value}"
    return value


def descriptor_for(item: dict[str, Any], original: dict[str, str]) -> str:
    name = str(item.get("color_name") or original.get("name") or "teacher color").strip()
    family = str(original.get("family") or "").strip().lower()
    desc = str(item.get("description") or original.get("descriptor") or "").strip()
    reason = str(item.get("reason") or "").strip()
    tags_raw = item.get("mood_tags") or []
    if not isinstance(tags_raw, list):
        tags_raw = []
    tags = ", ".join(str(x).strip().lower() for x in tags_raw if str(x).strip())
    parts = [f"{name.lower()}, {family} family"]
    if tags:
        parts.append(f"mood tags: {tags}")
    if desc:
        parts.append(desc)
    if reason:
        parts.append(reason)
    return ", ".join(parts)


def rows_from_response(
    response: dict[str, Any],
    originals: list[dict[str, str]],
    *,
    pair_weight: float,
    palette_weight: float,
    anchors_per_color: int,
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    by_hex = {clean_hex(row["hex"]): row for row in originals}
    items = response.get("items") or []
    if not isinstance(items, list):
        items = []
    pair_rows: list[dict[str, str]] = []
    palette_rows: list[dict[str, str]] = []
    seen_palette: set[str] = set()

    for item in items:
        if not isinstance(item, dict):
            continue
        hx = clean_hex(str(item.get("hex", "")))
        original = by_hex.get(hx)
        if original is None:
            continue
        name = str(item.get("color_name") or original.get("name") or hx).strip()
        family = str(original.get("family") or "").strip().lower()
        desc = descriptor_for(item, original)
        anchors = item.get("anchors") or []
        if not isinstance(anchors, list):
            anchors = []
        anchors_clean = []
        for anchor in anchors:
            text = " ".join(str(anchor).strip().lower().split())
            if text and text not in anchors_clean:
                anchors_clean.append(text)
        if not anchors_clean:
            anchors_clean = [str(original.get("keywords") or name).lower()]

        if hx not in seen_palette:
            seen_palette.add(hx)
            palette_rows.append(
                {
                    "name": name,
                    "hex": hx,
                    "family": family,
                    "descriptor": desc,
                    "keywords": ", ".join(anchors_clean[:anchors_per_color]),
                    "weight": str(palette_weight),
                }
            )
        for anchor in anchors_clean[:anchors_per_color]:
            pair_rows.append(
                {
                    "anchor_text": anchor,
                    "positive_color_name": name,
                    "positive_hex": hx,
                    "positive_descriptor": desc,
                    "color_family": family,
                    "weight": str(pair_weight),
                }
            )
    return pair_rows, palette_rows


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Enrich fixed palette colors with OpenAI teacher descriptions.")
    p.add_argument("--input", default="data/raw/user_curated/lab_uniform_teacher_5000_palette.csv")
    p.add_argument("--output", default="data/raw/user_curated/openai_enriched_palette.csv")
    p.add_argument("--pairs-output", default="data/raw/user_curated/openai_enriched_pairs.csv")
    p.add_argument("--audit", default="artifacts/logs/openai_palette_enrichment_audit.jsonl")
    p.add_argument("--model", default="gpt-4o-mini")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument(
        "--sample-even",
        action="store_true",
        help="Pick --limit colors evenly across the input instead of a contiguous slice.",
    )
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--anchors-per-color", type=int, default=4)
    p.add_argument("--pair-weight", type=float, default=3.4)
    p.add_argument("--palette-weight", type=float, default=1.1)
    p.add_argument("--temperature", type=float, default=0.75)
    p.add_argument("--sleep", type=float, default=0.5)
    p.add_argument("--env-file", action="append", default=[])
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    input_path = (root / args.input).resolve() if not Path(args.input).is_absolute() else Path(args.input)
    output_path = (root / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)
    pairs_path = (root / args.pairs_output).resolve() if not Path(args.pairs_output).is_absolute() else Path(args.pairs_output)
    audit_path = (root / args.audit).resolve() if not Path(args.audit).is_absolute() else Path(args.audit)

    env_files = [Path(p) for p in args.env_file]
    env_files.extend(
        [
            root.parent / "apps/web-presentation/.env.local",
            root.parent / "apps/api/.env",
        ]
    )
    api_key = load_env_key(env_files)
    if not api_key and not args.dry_run:
        print("ERROR: OPENAI_API_KEY not found in env or known .env files.", file=sys.stderr)
        sys.exit(1)

    all_rows = read_csv(input_path)
    if args.sample_even:
        pool = all_rows[args.offset :]
        if args.limit >= len(pool):
            rows = pool
        else:
            idxs = [
                round(i * (len(pool) - 1) / max(1, args.limit - 1))
                for i in range(args.limit)
            ]
            rows = [pool[i] for i in idxs]
    else:
        rows = all_rows[args.offset : args.offset + args.limit]
    print(f"Input rows: {len(all_rows)}; processing: {len(rows)} offset={args.offset} limit={args.limit}")
    print(f"Output palette: {output_path}")
    print(f"Output pairs: {pairs_path}")
    if args.dry_run:
        for row in rows[:5]:
            print(row.get("hex"), row.get("name"), row.get("family"))
        return

    pair_rows: list[dict[str, str]] = []
    palette_rows: list[dict[str, str]] = []

    for start in range(0, len(rows), args.batch_size):
        batch = rows[start : start + args.batch_size]
        batch_no = args.offset + start
        print(f"OpenAI batch offset={batch_no} size={len(batch)}")
        try:
            response = call_openai_batch(
                api_key=api_key,
                colors=batch,
                model=args.model,
                temperature=args.temperature,
            )
            b_pairs, b_palette = rows_from_response(
                response,
                batch,
                pair_weight=args.pair_weight,
                palette_weight=args.palette_weight,
                anchors_per_color=args.anchors_per_color,
            )
            pair_rows.extend(b_pairs)
            palette_rows.extend(b_palette)
            append_audit(
                audit_path,
                {"ok": True, "offset": batch_no, "size": len(batch), "response": response},
            )
            print(f"  -> palette {len(b_palette)} pairs {len(b_pairs)}")
        except Exception as exc:
            append_audit(
                audit_path,
                {"ok": False, "offset": batch_no, "size": len(batch), "error": str(exc)},
            )
            print(f"  ERROR: {exc}", file=sys.stderr)
        if args.sleep > 0:
            time.sleep(args.sleep)

    write_csv(output_path, PALETTE_HEADER, palette_rows)
    write_csv(pairs_path, PAIR_HEADER, pair_rows)
    print(f"Wrote palette rows: {len(palette_rows)}")
    print(f"Wrote pair rows: {len(pair_rows)}")


if __name__ == "__main__":
    main()
