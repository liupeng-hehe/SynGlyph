"""Optional NRC Word-Colour Association Lexicon loader."""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Any

from omegaconf import DictConfig

from colorrec.config import get_path
from colorrec.schemas import TrainingPair

logger = logging.getLogger(__name__)

NRC_FAMILIES = {
    "black",
    "blue",
    "brown",
    "green",
    "grey",
    "gray",
    "orange",
    "purple",
    "pink",
    "red",
    "white",
    "yellow",
}

FAMILY_PROTOTYPES: dict[str, str] = {
    "red": "red family, warm, vivid, saturated, passionate, intense, urgent",
    "orange": "orange family, warm, friendly, energetic, bright, cheerful",
    "yellow": "yellow family, warm, bright, cheerful, sunny, lively",
    "green": "green family, natural, fresh, organic, calm, earthy",
    "blue": "blue family, cool, calm, clean, trustworthy, stable",
    "purple": "purple family, cool, creative, mysterious, luxurious, expressive",
    "pink": "pink family, warm, soft, romantic, gentle, delicate",
    "brown": "brown family, warm, earthy, rustic, grounded, natural",
    "grey": "grey family, neutral, minimal, professional, balanced, calm",
    "black": "black family, dark, elegant, powerful, dramatic, serious",
    "white": "white family, clean, pure, minimal, light, simple",
}

COLOR_ALIASES = {
    "gray": "grey",
    "colour": "color",
}


def normalize_nrc_color(raw: str) -> str | None:
    s = str(raw).strip().lower()
    s = COLOR_ALIASES.get(s, s)
    if s in {"grey", "gray"}:
        return "grey"
    if s in NRC_FAMILIES:
        return "grey" if s == "gray" else s
    return None


def _detect_column(columns: list[str], candidates: list[str]) -> str | None:
    lower_map = {c.lower(): c for c in columns}
    for cand in candidates:
        if cand in columns:
            return cand
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None


def _inspect_columns(columns: list[str]) -> dict[str, str | None]:
    return {
        "word": _detect_column(columns, ["word", "term", "concept", "lemma"]),
        "sense": _detect_column(columns, ["sense", "sense_id", "gloss", "definition"]),
        "color": _detect_column(columns, ["color", "colour", "color_family", "family"]),
        "score": _detect_column(columns, ["association", "label", "score", "weight"]),
    }


def _make_pair_id(source: str, anchor: str, family: str) -> str:
    import hashlib

    norm_a = " ".join(anchor.strip().lower().split())
    digest = hashlib.sha1(f"{norm_a}|{family}".encode("utf-8")).hexdigest()[:12]
    return f"{source}:{digest}"


def _read_table(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    suffix = path.suffix.lower()
    if suffix in {".csv", ".tsv", ".txt"}:
        delimiter = "\t" if suffix == ".tsv" else ","
        with path.open(encoding="utf-8", newline="") as fh:
            sample = fh.read(2048)
            fh.seek(0)
            if suffix == ".txt" and "\t" in sample and sample.count("\t") > sample.count(","):
                delimiter = "\t"
            reader = csv.DictReader(fh, delimiter=delimiter)
            rows = [{k: (v or "").strip() for k, v in row.items() if k} for row in reader]
            return list(reader.fieldnames or []), rows
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            rows = [dict(item) for item in data]
            cols = list(rows[0].keys()) if rows else []
            return cols, rows
    raise ValueError(f"Unsupported NRC file format: {path}")


def load_nrc_word_colour_pairs(
    raw_dir: str | Path | None,
    *,
    default_weight: float = 0.9,
) -> list[TrainingPair]:
    """Load NRC word-colour pairs. Returns [] if directory missing or empty."""
    if raw_dir is None:
        logger.warning("NRC raw dir not configured; skipping")
        return []

    dir_path = Path(raw_dir)
    if not dir_path.exists():
        logger.warning(
            "NRC Word-Colour data not found at %s. "
            "Place files manually under data/raw/nrc_word_colour/. Skipping.",
            dir_path,
        )
        return []

    files: list[Path] = []
    if dir_path.is_file():
        files = [dir_path]
    else:
        for pattern in ("*.csv", "*.tsv", "*.txt", "*.json"):
            files.extend(sorted(dir_path.glob(pattern)))

    if not files:
        logger.warning("No readable NRC files under %s; skipping", dir_path)
        return []

    pairs: list[TrainingPair] = []
    skipped_unknown_color = 0

    for file_path in files:
        try:
            columns, rows = _read_table(file_path)
        except Exception as exc:
            logger.warning("Failed to read NRC file %s: %s", file_path, exc)
            continue

        detected = _inspect_columns(columns)
        logger.info("NRC schema inspection for %s: %s", file_path.name, detected)

        word_col = detected.get("word")
        color_col = detected.get("color")
        sense_col = detected.get("sense")

        if not word_col or not color_col:
            logger.warning("NRC file %s missing word/color columns; skipping file", file_path.name)
            continue

        for row_no, row in enumerate(rows, start=2):
            word = row.get(word_col, "").strip()
            if not word:
                continue
            family = normalize_nrc_color(row.get(color_col, ""))
            if family is None:
                skipped_unknown_color += 1
                logger.warning(
                    "Unknown NRC color %r in %s row %d; skipping",
                    row.get(color_col),
                    file_path.name,
                    row_no,
                )
                continue

            anchor = word.lower()
            if sense_col and row.get(sense_col, "").strip():
                anchor = f"{anchor} {row[sense_col].strip().lower()}"

            positive = FAMILY_PROTOTYPES.get(family, f"{family} family")
            pairs.append(
                TrainingPair(
                    pair_id=_make_pair_id("nrc_word_colour", anchor, family),
                    anchor=anchor,
                    positive=positive,
                    source="nrc_word_colour",
                    weight=default_weight,
                    metadata={"nrc_family": family, "source_file": file_path.name},
                )
            )

    if skipped_unknown_color:
        logger.warning("NRC loader skipped %d rows with unknown colors", skipped_unknown_color)

    logger.info("Loaded %d NRC word-colour training pairs", len(pairs))
    return pairs


def load_nrc_from_config(cfg: DictConfig) -> list[TrainingPair]:
    tp_cfg = cfg.data.get("training_pairs", {})
    weights = tp_cfg.get("weights", {})
    default_weight = float(weights.get("nrc_word_colour", 0.9))
    try:
        raw_dir = get_path(cfg, "raw_nrc_word_colour")
    except KeyError:
        from colorrec.config import resolve_path

        raw_dir = resolve_path("data/raw/nrc_word_colour")
    return load_nrc_word_colour_pairs(raw_dir, default_weight=default_weight)
