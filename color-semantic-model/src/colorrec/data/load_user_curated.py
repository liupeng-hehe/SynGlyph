"""Load user-curated training pairs from CSV."""

from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from typing import Any

from omegaconf import DictConfig

from colorrec.config import get_path, resolve_path
from colorrec.schemas import CandidateColor, TrainingPair, normalize_hex

logger = logging.getLogger(__name__)

SCHEMA_A_COLUMNS = {
    "anchor_text",
    "positive_color_name",
    "positive_hex",
    "positive_descriptor",
    "color_family",
    "weight",
}


def normalize_anchor(text: str) -> str:
    return " ".join(str(text).strip().lower().split())


def _parse_hex_list(raw: str) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    s = str(raw).strip()
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [normalize_hex(str(x)) for x in parsed if str(x).strip()]
        except json.JSONDecodeError:
            pass
    parts = re.split(r"[,;|]+", s)
    out: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        try:
            out.append(normalize_hex(part))
        except ValueError:
            logger.warning("Skipping invalid hex in list: %r", part)
    return out


def _lookup_color_by_hex(hex_val: str, bank: dict[str, CandidateColor]) -> CandidateColor | None:
    return bank.get(hex_val.upper())


def _lookup_color_by_name(name: str, bank_by_name: dict[str, CandidateColor]) -> CandidateColor | None:
    key = normalize_anchor(name)
    return bank_by_name.get(key)


def _build_bank_indexes(colors: list[CandidateColor]) -> tuple[dict[str, CandidateColor], dict[str, CandidateColor]]:
    by_hex = {c.hex.upper(): c for c in colors}
    by_name: dict[str, CandidateColor] = {}
    for c in colors:
        by_name[normalize_anchor(c.name)] = c
    return by_hex, by_name


def _make_pair_id(source: str, anchor: str, positive_key: str, positive: str) -> str:
    import hashlib

    norm_a = normalize_anchor(anchor)
    norm_p = " ".join(positive.strip().lower().split())
    digest = hashlib.sha1(f"{norm_a}|{positive_key}|{norm_p}".encode("utf-8")).hexdigest()[:12]
    return f"{source}:{digest}"


def _row_schema_a(
    row: dict[str, str],
    *,
    default_weight: float,
    bank_by_hex: dict[str, CandidateColor],
    bank_by_name: dict[str, CandidateColor],
) -> TrainingPair | None:
    anchor = normalize_anchor(row.get("anchor_text", ""))
    if not anchor:
        return None

    hex_raw = row.get("positive_hex", "").strip()
    if not hex_raw:
        return None
    try:
        hex_val = normalize_hex(hex_raw)
    except ValueError:
        logger.warning("Invalid positive_hex in user_curated row: %r", hex_raw)
        return None

    positive = row.get("positive_descriptor", "").strip()
    if not positive:
        found = _lookup_color_by_hex(hex_val, bank_by_hex)
        if found is not None:
            positive = found.descriptor
        else:
            name = row.get("positive_color_name", hex_val)
            positive = f"{name.strip().lower()}, {hex_val.lower()}"

    weight_raw = row.get("weight", "").strip()
    weight = float(weight_raw) if weight_raw else default_weight

    color_id = None
    found = _lookup_color_by_hex(hex_val, bank_by_hex)
    if found is not None:
        color_id = found.color_id

    meta: dict[str, Any] = {}
    if row.get("color_family"):
        meta["color_family"] = row["color_family"].strip()
    if row.get("positive_color_name"):
        meta["positive_color_name"] = row["positive_color_name"].strip()

    pair = TrainingPair(
        pair_id=_make_pair_id("user_curated", anchor, color_id or hex_val, positive),
        anchor=anchor,
        positive=positive,
        positive_color_id=color_id,
        positive_hex=hex_val,
        source="user_curated",
        weight=weight,
        metadata=meta,
    )
    return pair


def _row_schema_b(
    row: dict[str, str],
    *,
    default_weight: float,
    bank_by_hex: dict[str, CandidateColor],
) -> list[TrainingPair]:
    anchor = normalize_anchor(row.get("query", ""))
    if not anchor:
        return []

    preferred = _parse_hex_list(row.get("preferred_hexes", ""))
    if not preferred:
        return []

    rejected = _parse_hex_list(row.get("rejected_hexes", ""))
    pairs: list[TrainingPair] = []

    for hex_val in preferred:
        found = _lookup_color_by_hex(hex_val, bank_by_hex)
        if found is not None:
            positive = found.descriptor
            color_id = found.color_id
        else:
            positive = f"{anchor}, {hex_val.lower()}"
            color_id = None

        meta: dict[str, Any] = {}
        if rejected:
            meta["rejected_hexes"] = rejected

        pairs.append(
            TrainingPair(
                pair_id=_make_pair_id("user_curated", anchor, hex_val, positive),
                anchor=anchor,
                positive=positive,
                negatives=rejected,
                positive_color_id=color_id,
                positive_hex=hex_val,
                source="user_curated",
                weight=default_weight,
                metadata=meta,
            )
        )
    return pairs


def load_user_curated_pairs(
    path: str | Path | None,
    *,
    candidate_bank: list[CandidateColor] | None = None,
    default_weight: float = 2.5,
) -> list[TrainingPair]:
    """Load user curated pairs from CSV. Returns [] if file missing."""
    if path is None:
        logger.warning("user_curated path not configured; skipping")
        return []

    csv_path = Path(path)
    if not csv_path.exists():
        logger.warning(
            "user_curated file not found at %s; skipping user curated pairs",
            csv_path,
        )
        return []

    bank_by_hex, bank_by_name = _build_bank_indexes(candidate_bank or [])
    pairs: list[TrainingPair] = []

    with csv_path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            logger.warning("user_curated CSV has no header row")
            return []

        headers = {h.strip() for h in reader.fieldnames if h}
        is_schema_a = SCHEMA_A_COLUMNS.issubset({h.lower() for h in headers}) or "anchor_text" in headers
        is_schema_b = "query" in headers and "preferred_hexes" in headers

        for row_no, row in enumerate(reader, start=2):
            cleaned = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
            try:
                if is_schema_b and cleaned.get("query"):
                    pairs.extend(
                        _row_schema_b(
                            cleaned,
                            default_weight=default_weight,
                            bank_by_hex=bank_by_hex,
                        )
                    )
                elif cleaned.get("anchor_text"):
                    pair = _row_schema_a(
                        cleaned,
                        default_weight=default_weight,
                        bank_by_hex=bank_by_hex,
                        bank_by_name=bank_by_name,
                    )
                    if pair is not None:
                        pairs.append(pair)
                elif is_schema_a:
                    logger.warning("Skipping user_curated row %d: missing anchor_text", row_no)
            except Exception as exc:
                logger.warning("Failed to parse user_curated row %d: %s", row_no, exc)

    logger.info("Loaded %d user_curated training pairs", len(pairs))
    return pairs


def load_user_curated_from_config(
    cfg: DictConfig,
    candidate_bank: list[CandidateColor],
) -> list[TrainingPair]:
    tp_cfg = cfg.data.get("training_pairs", {})
    weights = tp_cfg.get("weights", {})
    default_weight = float(weights.get("user_curated", 2.5))
    try:
        path = get_path(cfg, "raw_user_curated")
    except KeyError:
        path = resolve_path("data/raw/user_curated/user_pairs.csv")
    return load_user_curated_pairs(path, candidate_bank=candidate_bank, default_weight=default_weight)
