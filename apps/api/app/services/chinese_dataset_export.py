"""Freeze Chinese glyph-region canonical dataset: DB + glyph loader -> artifacts + ml_dataset_version."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.chinese import (
    ChineseAnnotationSession,
    ChineseGlyphInstance,
    ChineseGlyphTemplate,
    ChineseRegion,
    ChineseTransition,
)
from app.models.ml_dataset_version import MLDatasetVersion
from app.services.artifact_paths import dataset_version_dir, file_uri
from app.services.chinese_canonical import (
    PRODUCT_LINE,
    SCHEMA_VERSION,
    SOURCE_MODE,
    SPLIT_SEED_PLACEHOLDER,
    SPLIT_STRATEGY_FULL_EXPORT,
    TASK_NAME,
    compute_dataset_hash,
    example_id_for_instance,
)
from app.services.chinese_dataset_features import (
    bbox_from_median_stroke,
    bbox_union,
    centroid_from_bbox,
    centroid_from_polygon,
    coarse_relative_position,
    curve_presence,
    euclidean_distance,
    polygon_area,
)
from app.services.chinese_dataset_quality import (
    add_template_mismatch_issue,
    collect_issues_for_example,
    merge_issue_counts,
)
from app.services.chinese_glyph_loader import load_glyph_with_provenance
from app.services.letter_sequence_dataset_export import get_git_sha


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _parse_json_col(s: str | None, default: Any) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return default


def _template_dict_from_db(t: ChineseGlyphTemplate) -> dict[str, Any]:
    strokes = _parse_json_col(t.strokes_json, [])
    medians = _parse_json_col(t.medians_json, [])
    return {
        "character": t.character,
        "decomposition": _parse_json_col(t.decomposition_json, None),
        "matches": _parse_json_col(t.matches_json, None),
        "strokes": strokes if isinstance(strokes, list) else [],
        "medians": medians if isinstance(medians, list) else [],
        "radical_strokes": None,
    }


def _merge_db_and_file_templates(
    db_tpl: ChineseGlyphTemplate | None,
    character: str,
    file_norm: dict[str, Any] | None,
    file_line: str | None,
    *,
    example_id: str,
    glyph_instance_id: str,
    issues: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, str | None, list[Any]]:
    """
    DB ChineseGlyphTemplate is canonical; file loader only fills gaps. If DB and file both
    have conflicting strokes/medians, DB wins and ``template_db_file_mismatch`` is recorded once.
    Returns (template_fields_dict, category, file_line_source, merged_medians_for_strokes_array).
    Category: db_only | file_only | db_plus_file_patch | missing_both
    """
    if db_tpl is None and file_norm is None:
        return (
            {
                "character": character,
                "decomposition": None,
                "matches": None,
                "stroke_count": 0,
                "radical_strokes": None,
                "missing_template": True,
            },
            "missing_both",
            None,
            [],
        )

    if db_tpl is None and file_norm is not None:
        m = dict(file_norm)
        med = m.get("medians") if isinstance(m.get("medians"), list) else []
        rad = m.get("rad_strokes") if isinstance(m.get("rad_strokes"), list) else None
        return (
            {
                "character": m.get("character") or character,
                "decomposition": m.get("decomposition"),
                "matches": m.get("matches"),
                "stroke_count": len(med),
                "radical_strokes": rad,
                "missing_template": False,
            },
            "file_only",
            file_line,
            med,
        )

    assert db_tpl is not None
    db_d = _template_dict_from_db(db_tpl)
    merged_strokes = list(db_d["strokes"])
    merged_medians = list(db_d["medians"])
    merged_decomp = db_d["decomposition"]
    merged_matches = db_d["matches"]
    patched = False

    mismatch_filed = False
    if file_norm:
        fn_med = file_norm.get("medians") if isinstance(file_norm.get("medians"), list) else []
        fn_str = file_norm.get("strokes") if isinstance(file_norm.get("strokes"), list) else []
        db_med_nonempty = bool(merged_medians and len(merged_medians) > 0)
        fn_med_nonempty = bool(fn_med and len(fn_med) > 0)
        if db_med_nonempty and fn_med_nonempty:
            if len(fn_med) != len(merged_medians) or _stable_hash(fn_med) != _stable_hash(merged_medians):
                mismatch_filed = True
        db_str_nonempty = bool(merged_strokes and len(merged_strokes) > 0)
        fn_str_nonempty = bool(fn_str and len(fn_str) > 0)
        if not mismatch_filed and db_str_nonempty and fn_str_nonempty and len(fn_str) == len(merged_strokes):
            if _stable_hash(fn_str) != _stable_hash(merged_strokes):
                mismatch_filed = True
        if mismatch_filed:
            add_template_mismatch_issue(
                issues,
                example_id=example_id,
                glyph_instance_id=glyph_instance_id,
                character=character,
            )

        if (not merged_medians or len(merged_medians) == 0) and fn_med:
            merged_medians = fn_med
            merged_strokes = fn_str if fn_str else merged_strokes
            patched = True
        if merged_decomp in (None, "") and file_norm.get("decomposition"):
            merged_decomp = file_norm.get("decomposition")
            patched = True
        if merged_matches in (None, [], "") and file_norm.get("matches") is not None:
            merged_matches = file_norm.get("matches")
            patched = True

    rad_out: list[Any] | None = None
    if file_norm and isinstance(file_norm.get("rad_strokes"), list):
        rad_out = file_norm.get("rad_strokes")
    stroke_count = len(merged_medians) if merged_medians else len(merged_strokes)

    out = {
        "character": db_d["character"] or character,
        "decomposition": merged_decomp,
        "matches": merged_matches,
        "stroke_count": stroke_count,
        "radical_strokes": rad_out,
        "missing_template": False,
    }

    medians_out = list(merged_medians)
    if file_norm is None:
        return out, "db_only", None, medians_out
    if patched:
        return out, "db_plus_file_patch", file_line, medians_out
    return out, "db_only", file_line, medians_out


def _build_strokes_array(medians: list[Any]) -> list[dict[str, Any]]:
    strokes_out: list[dict[str, Any]] = []
    for i, med in enumerate(medians):
        if not isinstance(med, list):
            continue
        sm = [[float(p[0]), float(p[1])] for p in med if isinstance(p, (list, tuple)) and len(p) >= 2]
        bb = bbox_from_median_stroke(sm)
        strokes_out.append(
            {
                "stroke_id": i,
                "median": sm,
                "bbox": bb,
                "component_hint": None,
            }
        )
    return strokes_out


def _sort_regions(regions: list[ChineseRegion]) -> list[ChineseRegion]:
    return sorted(regions, key=lambda r: (r.z_index, r.id))


def _sort_transitions(trs: list[ChineseTransition]) -> list[ChineseTransition]:
    return sorted(trs, key=lambda t: (t.source_region_id, t.target_region_id, t.id))


def _build_canonical_row(
    inst: ChineseGlyphInstance,
    *,
    session: ChineseAnnotationSession | None,
    dictionary_owner: str | None,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    character = inst.character or ""
    ex_id = example_id_for_instance(inst.id)
    file_norm, file_line = load_glyph_with_provenance(character)

    merged_tpl, tpl_category, file_line_res, medians_for_strokes = _merge_db_and_file_templates(
        inst.template,
        character,
        file_norm,
        file_line,
        example_id=ex_id,
        glyph_instance_id=inst.id,
        issues=issues,
    )

    strokes = _build_strokes_array(medians_for_strokes if isinstance(medians_for_strokes, list) else [])
    stroke_count = len(strokes)
    glyph_bbox = bbox_union([s["bbox"] for s in strokes]) if strokes else [0, 0, 0, 0]

    regs_sorted = _sort_regions(list(inst.regions))
    region_id_to_index: dict[str, int] = {}
    regions_out: list[dict[str, Any]] = []
    for idx, reg in enumerate(regs_sorted):
        region_id_to_index[reg.id] = idx
        stroke_ids = _parse_json_col(reg.stroke_ids_json, [])
        if not isinstance(stroke_ids, list):
            stroke_ids = []
        stroke_ids_int = [int(x) for x in stroke_ids if isinstance(x, int) or (isinstance(x, float) and x == int(x))]
        polygon = _parse_json_col(reg.polygon_json, [])
        anchor = _parse_json_col(reg.anchor_json, {})
        color = _parse_json_col(reg.color_json, {})
        spread = _parse_json_col(reg.spread_json, {})

        stroke_bboxes = []
        for sid in stroke_ids_int:
            if 0 <= sid < len(strokes):
                stroke_bboxes.append(strokes[sid]["bbox"])
        reg_bbox = bbox_union(stroke_bboxes) if stroke_bboxes else glyph_bbox
        if polygon and isinstance(polygon, list) and len(polygon) >= 3:
            pts = [{"x": float(p["x"]), "y": float(p["y"])} for p in polygon if isinstance(p, dict)]
            cen = centroid_from_polygon(pts) or centroid_from_bbox(reg_bbox)
            area = polygon_area(pts)
        else:
            cen = centroid_from_bbox(reg_bbox)
            area = max(0.0, (reg_bbox[2] - reg_bbox[0]) * (reg_bbox[3] - reg_bbox[1]))

        coarse = coarse_relative_position(cen, glyph_bbox)

        regions_out.append(
            {
                "region_id": reg.id,
                "selection_mode": reg.selection_mode,
                "stroke_ids": stroke_ids_int,
                "polygon": polygon if isinstance(polygon, list) else [],
                "anchor": anchor,
                "color": color,
                "spread": spread,
                "intensity": float(reg.intensity),
                "z_index": int(reg.z_index),
                "bbox": reg_bbox,
                "centroid": cen,
                "selected_stroke_count": len(stroke_ids_int),
                "coarse_relative_position": coarse,
                "area": area,
            }
        )

    tr_sorted = _sort_transitions(list(inst.transitions))
    transitions_out: list[dict[str, Any]] = []
    for tr in tr_sorted:
        curve = _parse_json_col(tr.curve_json, None)
        src_c = regions_out[region_id_to_index[tr.source_region_id]]["centroid"] if tr.source_region_id in region_id_to_index else None
        tgt_c = regions_out[region_id_to_index[tr.target_region_id]]["centroid"] if tr.target_region_id in region_id_to_index else None
        dist = None
        if src_c and tgt_c:
            dist = euclidean_distance(src_c, tgt_c)
        transitions_out.append(
            {
                "transition_id": tr.id,
                "source_region_id": tr.source_region_id,
                "target_region_id": tr.target_region_id,
                "strength": float(tr.strength),
                "width": float(tr.width),
                "falloff": float(tr.falloff),
                "curve": curve,
                "curve_summary": curve_presence(curve),
                "source_target_distance": dist,
                "mode": tr.mode,
                "blend_mode": tr.blend_mode,
            }
        )

    transform_parsed = _parse_json_col(inst.transform_json, None)

    selection_mode_counts: dict[str, int] = {}
    for reg in regions_out:
        sm = reg.get("selection_mode") or "unknown"
        selection_mode_counts[sm] = selection_mode_counts.get(sm, 0) + 1

    features = {
        "stroke_count": stroke_count,
        "region_count": len(regions_out),
        "transition_count": len(transitions_out),
        "avg_regions_per_glyph": None,
        "selection_mode_counts": selection_mode_counts,
        "has_radical_strokes": bool(merged_tpl.get("radical_strokes")),
        "dangling_transition_count": 0,
        "duplicate_region_selection_count": 0,
        "component_count": None,
    }

    meta = {
        "dictionary_owner": dictionary_owner,
        "annotation_session_id": session.id if session else None,
        "glyph_instance_id": inst.id,
        "source_mode": SOURCE_MODE,
        "created_at": session.created_at.isoformat() if session and session.created_at else None,
        "updated_at": inst.updated_at.isoformat() if inst.updated_at else None,
        "transform_json": transform_parsed,
    }

    row: dict[str, Any] = {
        "example_id": ex_id,
        "product_line": PRODUCT_LINE,
        "task_name": TASK_NAME,
        "schema_version": SCHEMA_VERSION,
        "character": character,
        "glyph_template_id": inst.template_id,
        "annotation_session_id": session.id if session else None,
        "glyph_instance_id": inst.id,
        "dictionary_id": session.dictionary_id if session else None,
        "template": {
            **merged_tpl,
            "source": "db_primary_file_fallback",
            "template_export_category": tpl_category,
            "file_line_source": file_line_res,
        },
        "strokes": strokes,
        "regions": regions_out,
        "region_id_to_index": region_id_to_index,
        "transitions": transitions_out,
        "features": features,
        "metadata": meta,
    }
    return row


def freeze_chinese_dataset_version(
    db: Session,
    *,
    task_name: str = TASK_NAME,
    source_cutoff_at: datetime | None = None,
    created_by_run_id: str | None = None,
) -> MLDatasetVersion:
    """
    Export all Chinese glyph instances to canonical examples.jsonl + manifest + stats + quality_report.
    Train/val/test counts are placeholders (full export only); see docs.
    """
    if task_name != TASK_NAME:
        raise ValueError(f"Only task_name={TASK_NAME!r} supported in Phase 1")

    q = (
        db.query(ChineseGlyphInstance)
        .options(
            joinedload(ChineseGlyphInstance.regions),
            joinedload(ChineseGlyphInstance.transitions),
            joinedload(ChineseGlyphInstance.session).joinedload(ChineseAnnotationSession.dictionary),
            joinedload(ChineseGlyphInstance.template),
        )
        .order_by(ChineseGlyphInstance.id)
    )
    if source_cutoff_at is not None:
        q = q.filter(ChineseGlyphInstance.updated_at <= source_cutoff_at)

    instances = q.all()
    all_issues: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    chars_seen: set[str] = set()
    sessions_seen: set[str] = set()
    tpl_cat_counts: dict[str, int] = {}
    file_line_counts: dict[str, int] = {"local_json": 0, "graphics_txt": 0, "none": 0}
    region_counts_per_glyph: list[int] = []
    stroke_hist: dict[str, int] = {}
    chars_no_regions = 0
    chars_no_trans = 0
    char_to_count: dict[str, int] = {}

    for inst in instances:
        session = inst.session
        owner = None
        if session and session.dictionary:
            owner = session.dictionary.owner
        issues: list[dict[str, Any]] = []
        row = _build_canonical_row(inst, session=session, dictionary_owner=owner, issues=issues)
        all_issues.extend(issues)
        row_issues = collect_issues_for_example(row)
        all_issues.extend(row_issues)
        rows.append(row)

        ch = row["character"]
        chars_seen.add(ch)
        if session:
            sessions_seen.add(session.id)
        rc = row["features"]["region_count"]
        tc = row["features"]["transition_count"]
        region_counts_per_glyph.append(rc)
        if rc == 0:
            chars_no_regions += 1
        if tc == 0:
            chars_no_trans += 1
        char_to_count[ch] = char_to_count.get(ch, 0) + 1

        cat = (row.get("template") or {}).get("template_export_category") or "unknown"
        tpl_cat_counts[cat] = tpl_cat_counts.get(cat, 0) + 1
        fls = (row.get("template") or {}).get("file_line_source")
        if fls == "local_json":
            file_line_counts["local_json"] += 1
        elif fls == "graphics_txt":
            file_line_counts["graphics_txt"] += 1
        else:
            file_line_counts["none"] += 1

        sc = row["features"]["stroke_count"]
        if sc <= 5:
            sk = "1-5"
        elif sc <= 10:
            sk = "6-10"
        elif sc <= 15:
            sk = "11-15"
        else:
            sk = "16+"
        stroke_hist[sk] = stroke_hist.get(sk, 0) + 1

    region_count_buckets: dict[str, int] = {"0": 0, "1": 0, "2-3": 0, "4-6": 0, "7+": 0}
    for n in region_counts_per_glyph:
        if n == 0:
            region_count_buckets["0"] += 1
        elif n == 1:
            region_count_buckets["1"] += 1
        elif n <= 3:
            region_count_buckets["2-3"] += 1
        elif n <= 6:
            region_count_buckets["4-6"] += 1
        else:
            region_count_buckets["7+"] += 1

    duplicate_character_count = sum(1 for _c, n in char_to_count.items() if n > 1)

    dvh = compute_dataset_hash(rows)
    dvid = str(uuid.uuid4())
    out_dir = dataset_version_dir(dvid)
    examples_path = out_dir / "examples.jsonl"

    with examples_path.open("w", encoding="utf-8") as fe:
        for r in sorted(rows, key=lambda x: x["example_id"]):
            fe.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")

    n_ex = len(rows)
    issue_counts = merge_issue_counts(all_issues)
    n_err = sum(1 for x in all_issues if x.get("severity") == "error")
    n_warn = sum(1 for x in all_issues if x.get("severity") == "warning")
    n_info = sum(1 for x in all_issues if x.get("severity") == "info")

    quality_report = {
        "issue_counts": issue_counts,
        "issues": all_issues,
        "summary": {"n_errors": n_err, "n_warnings": n_warn, "n_infos": n_info, "n_total": len(all_issues)},
    }
    (out_dir / "quality_report.json").write_text(
        json.dumps(quality_report, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )

    stats = {
        "unique_char_count": len(chars_seen),
        "annotation_session_count": len(sessions_seen),
        "glyph_instance_count": n_ex,
        "region_count_total": sum(region_counts_per_glyph),
        "transition_count_total": sum(r["features"]["transition_count"] for r in rows),
        "avg_regions_per_glyph": (sum(region_counts_per_glyph) / n_ex) if n_ex else 0.0,
        "avg_transitions_per_glyph": (
            sum(r["features"]["transition_count"] for r in rows) / n_ex if n_ex else 0.0
        ),
        "selection_mode_distribution": _aggregate_selection_modes(rows),
        "chars_with_no_regions_count": chars_no_regions,
        "chars_with_no_transitions_count": chars_no_trans,
        "duplicate_character_count": duplicate_character_count,
        "template_source_distribution": tpl_cat_counts,
        "template_file_line_distribution": file_line_counts,
        "missing_template_count": tpl_cat_counts.get("missing_both", 0),
        "missing_radical_strokes_count": sum(
            1 for r in rows if not (r.get("template") or {}).get("radical_strokes")
        ),
        "stroke_count_distribution": stroke_hist,
        "region_count_distribution": region_count_buckets,
    }
    (out_dir / "stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

    manifest = {
        "dataset_version_id": dvid,
        "product_line": PRODUCT_LINE,
        "task_name": task_name,
        "source_mode": SOURCE_MODE,
        "schema_version": SCHEMA_VERSION,
        "split_seed": SPLIT_SEED_PLACEHOLDER,
        "split_strategy": SPLIT_STRATEGY_FULL_EXPORT,
        "split_placeholder_note": "train_count/val_count/test_count are placeholders; Phase 1 does not define train/val/test splits.",
        "source_cutoff_at": source_cutoff_at.isoformat() if source_cutoff_at else None,
        "example_count": n_ex,
        "train_count": n_ex,
        "val_count": 0,
        "test_count": 0,
        "dataset_hash": dvh,
        "git_sha": get_git_sha(),
        "created_at": _utc_now_iso(),
        "files": ["examples.jsonl", "manifest.json", "stats.json", "quality_report.json"],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    man_uri = file_uri(out_dir / "manifest.json")

    row_db = MLDatasetVersion(
        id=dvid,
        product_line=PRODUCT_LINE,
        task_name=task_name,
        source_mode=SOURCE_MODE,
        schema_version=SCHEMA_VERSION,
        split_seed=SPLIT_SEED_PLACEHOLDER,
        split_strategy=SPLIT_STRATEGY_FULL_EXPORT,
        source_cutoff_at=source_cutoff_at,
        example_count=n_ex,
        train_count=n_ex,
        val_count=0,
        test_count=0,
        dataset_hash=dvh,
        manifest_uri=man_uri,
        stats_json=json.dumps(stats, ensure_ascii=False),
        git_sha=get_git_sha(),
        created_by_run_id=created_by_run_id,
    )
    db.add(row_db)
    db.commit()
    db.refresh(row_db)
    return row_db


def _aggregate_selection_modes(rows: list[dict[str, Any]]) -> dict[str, int]:
    acc: dict[str, int] = {}
    for r in rows:
        smc = (r.get("features") or {}).get("selection_mode_counts") or {}
        for k, v in smc.items():
            acc[k] = acc.get(k, 0) + int(v)
    return acc


def load_examples_from_artifact(examples_path: Any) -> list[dict[str, Any]]:
    from pathlib import Path

    p = Path(examples_path)
    out: list[dict[str, Any]] = []
    with p.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out
