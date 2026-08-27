"""Distill Color Studio–style OpenAI suggestions into user_curated training CSV rows."""

from __future__ import annotations

import csv
import json
import logging
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from colorrec.colorspace import hex_to_rgb, infer_color_family_from_hsl_or_rgb, rgb_to_hsl
from colorrec.schemas import normalize_hex

logger = logging.getLogger(__name__)

OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions"

# Keep anchor format aligned with apps/web-presentation `buildColorRecQuery`.
DISTILL_SYSTEM = """You are a synesthetic color designer for readable PDF passage backgrounds.

Output a single JSON object with exactly these keys (no markdown fences):
- "hex": string, 7-char CSS hex like "#1A2B3C", sRGB suitable as a SOFT WASH behind dark serif text (prefer gentle tints unless feelings demand moody darkness).
- "color_name": string, 2–5 words, evocative name for this wash (not a generic Crayola label unless it fits).
- "description": string, one or two atmospheric sentences for the author UI.
- "confidence": exactly one of "low", "medium", "high"
- "reason": brief rationale tying passage + feelings to hue/chroma.

Respond ONLY with raw JSON."""

SCHEMA_A_HEADER = [
    "anchor_text",
    "positive_color_name",
    "positive_hex",
    "positive_descriptor",
    "color_family",
    "weight",
]

PALETTE_HEADER = ["name", "hex", "family", "descriptor", "keywords", "weight"]


@dataclass
class DistillSeed:
    passage: str
    feelings: list[str] = field(default_factory=list)
    note: str = ""


@dataclass
class DistillRow:
    anchor_text: str
    positive_color_name: str
    positive_hex: str
    positive_descriptor: str
    color_family: str
    weight: float
    source_variant: int = 0
    openai_model: str = ""
    confidence: str = ""


def build_studio_anchor(passage: str, feelings: list[str]) -> str:
    """Mirror web Color Studio / colorrec query: feelings + passage."""
    feel = ", ".join(f.strip().lower() for f in feelings if f and f.strip())
    clip = passage.strip()[:400]
    if feel and clip:
        return f"{feel}. {clip}"
    if feel:
        return feel
    if clip:
        return clip
    return "neutral literary passage"


def build_distill_user_prompt(
    passage: str,
    feelings: list[str],
    *,
    variant: int = 0,
) -> str:
    anchor = build_studio_anchor(passage, feelings)
    feel = ", ".join(feelings) if feelings else "(none)"
    vary = ""
    if variant > 0:
        vary = (
            f'\nVariant {variant}: propose a SECOND plausible wash visibly different '
            "from a typical first pick, still coherent with passage + feelings."
        )
    return (
        f'Training anchor (use this mood+text pairing):\n"""\n{anchor}\n"""\n\n'
        f"Feelings / mood chips: {feel}\n"
        f"Passage excerpt:\n\"\"\"\n{passage.strip()[:6000] or '(empty)'}\n\"\"\""
        f"{vary}"
    )


def _parse_json_loose(raw: str) -> dict[str, Any]:
    t = raw.strip()
    try:
        parsed = json.loads(t)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        parsed = json.loads(t[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("No JSON object in model response")


def _tone_words(h: float, s: float, l: float) -> str:
    parts: list[str] = []
    if l >= 0.72:
        parts.append("light")
    elif l <= 0.32:
        parts.append("dark")
    else:
        parts.append("balanced")
    if s >= 0.55:
        parts.append("vivid")
    elif s <= 0.22:
        parts.append("muted")
    else:
        parts.append("rich")
    return ", ".join(parts)


def build_positive_descriptor(
    *,
    color_name: str,
    family: str,
    hex_val: str,
    description: str,
    reason: str,
    feelings: list[str],
    passage: str,
) -> str:
    r, g, b = hex_to_rgb(hex_val)
    h, s, l = rgb_to_hsl(r, g, b)
    tone = _tone_words(h, s, l)
    feel = ", ".join(feelings) if feelings else ""
    passage_hint = passage.strip()[:120]
    chunks = [
        f"{color_name.strip().lower()}, {family} family, {tone}",
    ]
    if feel:
        chunks.append(feel)
    if passage_hint:
        chunks.append(passage_hint)
    if description.strip():
        chunks.append(description.strip())
    if reason.strip():
        chunks.append(reason.strip())
    return ", ".join(c for c in chunks if c)


def openai_draft_to_row(
    draft: dict[str, Any],
    *,
    anchor: str,
    feelings: list[str],
    passage: str,
    weight: float,
    variant: int = 0,
    model: str = "",
) -> DistillRow:
    hex_val = normalize_hex(str(draft.get("hex", "")))
    r, g, b = hex_to_rgb(hex_val)
    h, s, l = rgb_to_hsl(r, g, b)
    family_hsl = infer_color_family_from_hsl_or_rgb(r, g, b, h=h, s=s, l=l)
    color_name = str(draft.get("color_name") or draft.get("name") or "suggested wash").strip()
    description = str(draft.get("description") or "").strip()
    reason = str(draft.get("reason") or "").strip()
    confidence = str(draft.get("confidence") or "medium").strip()

    return DistillRow(
        anchor_text=anchor,
        positive_color_name=color_name,
        positive_hex=hex_val,
        positive_descriptor=build_positive_descriptor(
            color_name=color_name,
            family=family_hsl,
            hex_val=hex_val,
            description=description,
            reason=reason,
            feelings=feelings,
            passage=passage,
        ),
        color_family=family_hsl,
        weight=weight,
        source_variant=variant,
        openai_model=model,
        confidence=confidence,
    )


def call_openai_distill(
    *,
    api_key: str,
    passage: str,
    feelings: list[str],
    model: str = "gpt-4o-mini",
    variant: int = 0,
    temperature: float | None = None,
) -> dict[str, Any]:
    if not api_key.strip():
        raise ValueError("OPENAI_API_KEY is required for distillation")

    user_content = build_distill_user_prompt(passage, feelings, variant=variant)
    temp = temperature if temperature is not None else (1.05 if variant > 0 else 0.75)
    payload = {
        "model": model,
        "temperature": temp,
        "messages": [
            {"role": "system", "content": DISTILL_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        OPENAI_CHAT_COMPLETIONS,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key.strip()}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {err}") from exc

    raw = body.get("choices", [{}])[0].get("message", {}).get("content")
    if not raw:
        raise RuntimeError("Empty OpenAI response")
    return _parse_json_loose(str(raw))


def load_seeds_jsonl(path: Path) -> list[DistillSeed]:
    seeds: list[DistillSeed] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSONL line {line_no} in {path}") from exc
        passage = str(obj.get("passage", ""))
        feelings_raw = obj.get("feelings") or []
        if not isinstance(feelings_raw, list):
            feelings_raw = [feelings_raw]
        feelings = [str(x).strip().lower() for x in feelings_raw if str(x).strip()]
        seeds.append(
            DistillSeed(
                passage=passage,
                feelings=feelings,
                note=str(obj.get("note", "")),
            )
        )
    return seeds


def distill_row_to_csv_dict(row: DistillRow) -> dict[str, str]:
    return {
        "anchor_text": row.anchor_text,
        "positive_color_name": row.positive_color_name,
        "positive_hex": row.positive_hex,
        "positive_descriptor": row.positive_descriptor,
        "color_family": row.color_family,
        "weight": str(row.weight),
    }


def distill_row_to_palette_dict(row: DistillRow) -> dict[str, str]:
    keywords = row.anchor_text[:160]
    return {
        "name": row.positive_color_name,
        "hex": row.positive_hex,
        "family": row.color_family,
        "descriptor": row.positive_descriptor[:220],
        "keywords": keywords,
        "weight": "1.0",
    }


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _write_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def append_csv_rows(path: Path, header: list[str], rows: list[dict[str, str]]) -> int:
    """Append rows; create file with header if missing. Returns rows written."""
    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return len(rows)


def _dedupe_pair_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for row in rows:
        key = (
            " ".join(row.get("anchor_text", "").lower().split()),
            row.get("positive_hex", "").upper(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _dedupe_palette_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for row in rows:
        hx = row.get("hex", "").upper()
        if not hx or hx in seen:
            continue
        seen.add(hx)
        out.append(row)
    return out


def merge_distill_into_user_curated(
    *,
    distill_pairs_path: Path,
    user_pairs_path: Path,
    distill_palette_path: Path,
    curated_palette_path: Path,
) -> dict[str, int]:
    """Append distilled pairs/palette into main training CSVs (deduped)."""
    distill_pairs = _read_csv_rows(distill_pairs_path)
    existing_pairs = _read_csv_rows(user_pairs_path)
    merged_pairs = _dedupe_pair_rows(existing_pairs + distill_pairs)
    _write_csv(user_pairs_path, SCHEMA_A_HEADER, merged_pairs)

    distill_palette = _read_csv_rows(distill_palette_path)
    existing_palette = _read_csv_rows(curated_palette_path)
    merged_palette = _dedupe_palette_rows(existing_palette + distill_palette)
    _write_csv(curated_palette_path, PALETTE_HEADER, merged_palette)

    return {
        "pairs_before": len(existing_pairs),
        "pairs_distill": len(distill_pairs),
        "pairs_after": len(merged_pairs),
        "palette_before": len(existing_palette),
        "palette_distill": len(distill_palette),
        "palette_after": len(merged_palette),
    }


def append_audit_record(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def slug_anchor(anchor: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", anchor.lower()).strip("-")
    return s[:max_len] or "sample"
