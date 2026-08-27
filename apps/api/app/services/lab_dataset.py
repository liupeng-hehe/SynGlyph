"""Export lab annotations to letter-sequence JSONL for training."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.lab_profile import LabCoverageWord, LabLetterAnnotation, LabProfile
from app.services.lab_manifest import parse_manifest
from app.utils.color import hex_to_lab

try:
    from letter_sequence.data.export_dataset import assign_split, canonical_to_v2_legacy
except ImportError:
    assign_split = None  # type: ignore[misc,assignment]
    canonical_to_v2_legacy = None  # type: ignore[misc,assignment]


def _example_id(profile_id: str, kind: str, key: str) -> str:
    raw = f"lab|english|letter_sequence|{profile_id}|{kind}|{key.lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _default_prom_spread() -> tuple[float, float]:
    return 0.62, 0.38


_ALPHA = set("abcdefghijklmnopqrstuvwxyz")


def _boundary_targets_for_filtered_word(word_lower: str, boundary_influence: list[float] | None) -> list[float]:
    """target_boundary length = len(filtered letters) - 1 (English letter_sequence)."""
    inf = list(boundary_influence or [])
    idxs = [i for i, c in enumerate(word_lower) if c in _ALPHA]
    if len(idxs) < 2:
        return []
    out: list[float] = []
    for k in range(len(idxs) - 1):
        i, j = idxs[k], idxs[k + 1]
        if j == i + 1 and i < len(inf):
            try:
                out.append(max(0.0, min(1.0, float(inf[i]))))
            except (TypeError, ValueError, IndexError):
                out.append(0.48)
        else:
            out.append(0.48)
    return out


def _word_row_from_letters(
    *,
    profile_id: str,
    word_text: str,
    letters_lower: list[str],
    labs: list[list[float]],
    target_prominence: list[float],
    target_spread: list[float],
    target_boundary: list[float],
    seed: int,
    kind_key: str,
    ann_id: str,
    stim_id: str,
) -> dict[str, Any] | None:
    if assign_split is None or canonical_to_v2_legacy is None:
        raise RuntimeError("letter_sequence package not importable")
    L = len(letters_lower)
    if L == 0 or len(labs) != L:
        return None
    if len(target_prominence) != L or len(target_spread) != L:
        return None
    if L == 1:
        if len(target_boundary) != 0:
            return None
    elif len(target_boundary) != L - 1:
        return None
    example_id = _example_id(profile_id, kind_key, kind_key + ":" + word_text)
    split = assign_split(example_id, seed, train_ratio=0.85, val_ratio=0.075)
    canonical: dict[str, Any] = {
        "example_id": example_id,
        "product_line": "english",
        "task_name": "letter_sequence",
        "schema_version": "letter_sequence_dataset_v1",
        "word_text": word_text,
        "letters": letters_lower,
        "targets": {
            "lab": labs,
            "prominence": list(target_prominence),
            "spread": list(target_spread),
            "boundary": list(target_boundary),
        },
        "source": {
            "stimulus_id": stim_id,
            "annotation_id": ann_id,
            "feedback_id": None,
            "feedback_applied": False,
        },
        "split": split,
    }
    return canonical_to_v2_legacy(canonical)


def collect_training_rows(db: Session, profile: LabProfile) -> tuple[list[dict[str, Any]], int]:
    """Build legacy v2 JSONL rows for all annotated letters and completed coverage words."""
    manifest = parse_manifest(profile)
    letter_by_char = {row.char.lower(): row for row in profile.letters}
    rows: list[dict[str, Any]] = []

    for ch in manifest.letters_order:
        row = letter_by_char.get(ch)
        if row is None or not row.annotated:
            continue
        try:
            lab = [float(row.lab_l), float(row.lab_a), float(row.lab_b)]
        except (TypeError, ValueError):
            try:
                lab = list(hex_to_lab(row.color_hex))
            except ValueError:
                continue
        lt = ch.lower()
        legacy = _word_row_from_letters(
            profile_id=profile.id,
            word_text=lt,
            letters_lower=[lt],
            labs=[lab],
            target_prominence=[float(row.prominence)],
            target_spread=[float(row.spread)],
            target_boundary=[],
            seed=manifest.seed,
            kind_key="letter",
            ann_id=row.id,
            stim_id=f"lab:{profile.id}:letter:{lt}",
        )
        if legacy:
            rows.append(legacy)

    cov_rows: dict[str, LabCoverageWord] = {w.word.lower(): w for w in profile.coverage_words}
    for w in manifest.coverage_words:
        cw = cov_rows.get(w.lower())
        if cw is None or not cw.completed:
            continue
        word_text = cw.word
        wlow = word_text.lower()
        manual_obj: dict[str, Any] | None = None
        if cw.manual_adjustments_json:
            try:
                raw_m = json.loads(cw.manual_adjustments_json)
                manual_obj = raw_m if isinstance(raw_m, dict) else None
            except (json.JSONDecodeError, TypeError):
                manual_obj = None

        entries_by_index: dict[int, dict[str, Any]] = {}
        if manual_obj:
            for ent in manual_obj.get("letters") or []:
                if not isinstance(ent, dict):
                    continue
                ix = ent.get("index")
                if isinstance(ix, int):
                    entries_by_index[ix] = ent

        adjustments_char: dict[str, str] = {}
        if manual_obj and not entries_by_index:
            for ent in manual_obj.get("letters") or []:
                if isinstance(ent, dict) and ent.get("char"):
                    adjustments_char[str(ent["char"]).lower()] = str(ent.get("color") or "")

        has_indexed = len(entries_by_index) > 0
        filtered_letters: list[str] = []
        labs_f: list[list[float]] = []
        prom_list: list[float] = []
        spr_list: list[float] = []

        for i, lt in enumerate(wlow):
            if lt not in _ALPHA:
                continue
            hex_c = None
            prom_v: float | None = None
            spr_v: float | None = None
            if has_indexed:
                ent_idx = entries_by_index.get(i)
                if ent_idx:
                    hex_c = ent_idx.get("color")
                    try:
                        if ent_idx.get("prominence") is not None:
                            prom_v = float(ent_idx["prominence"])
                        if ent_idx.get("spread") is not None:
                            spr_v = float(ent_idx["spread"])
                    except (TypeError, ValueError):
                        prom_v, spr_v = None, None
            else:
                hex_c = adjustments_char.get(lt)

            if hex_c:
                try:
                    hx = str(hex_c)
                    if not hx.startswith("#"):
                        hx = f"#{hx}"
                    labs_f.append(list(hex_to_lab(hx)))
                except ValueError:
                    lr = letter_by_char.get(lt)
                    if lr and lr.annotated:
                        labs_f.append(list(hex_to_lab(lr.color_hex)))
                    else:
                        labs_f.append([70.0, 5.0, -25.0])
            else:
                lr = letter_by_char.get(lt)
                if lr and lr.annotated:
                    labs_f.append(list(hex_to_lab(lr.color_hex)))
                else:
                    labs_f.append([70.0, 5.0, -25.0])
            filtered_letters.append(lt)

            lr2 = letter_by_char.get(lt)
            dp, ds = _default_prom_spread()
            if prom_v is not None and spr_v is not None:
                prom_list.append(max(0.0, min(1.0, prom_v)))
                spr_list.append(max(0.0, min(1.0, spr_v)))
            elif lr2:
                prom_list.append(float(lr2.prominence))
                spr_list.append(float(lr2.spread))
            else:
                prom_list.append(dp)
                spr_list.append(ds)

        if not filtered_letters:
            continue
        boundary_raw: list[float] | None = None
        if cw.manual_adjustments_json:
            try:
                obj = json.loads(cw.manual_adjustments_json)
                raw_bi = obj.get("boundary_influence")
                if isinstance(raw_bi, list):
                    boundary_raw = []
                    for x in raw_bi:
                        try:
                            boundary_raw.append(float(x))
                        except (TypeError, ValueError):
                            boundary_raw.append(0.5)
            except (json.JSONDecodeError, TypeError):
                boundary_raw = None
        target_b = _boundary_targets_for_filtered_word(word_text.lower(), boundary_raw)
        legacy = _word_row_from_letters(
            profile_id=profile.id,
            word_text=word_text,
            letters_lower=filtered_letters,
            labs=labs_f,
            target_prominence=prom_list,
            target_spread=spr_list,
            target_boundary=target_b,
            seed=manifest.seed,
            kind_key="coverage",
            ann_id=cw.id,
            stim_id=f"lab:{profile.id}:coverage:{word_text.lower()}",
        )
        if legacy:
            tier = getattr(cw, "coverage_tier", None) or "legacy"
            if tier in ("anchor", "assist"):
                legacy["coverage_tier"] = tier
                legacy["accepted_prediction"] = bool(cw.accepted_prediction)
            rows.append(legacy)

    return rows, len(rows)


def write_samples_jsonl(db: Session, profile: LabProfile, out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows, n = collect_training_rows(db, profile)
    with out_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return n
