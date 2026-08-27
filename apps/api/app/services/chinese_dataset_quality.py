"""Quality rules for Chinese canonical examples: machine-readable issues with severity."""

from __future__ import annotations

import json
from typing import Any, Literal

Severity = Literal["error", "warning", "info"]

# DB / API selection_mode values (see chinese_api)
_VALID_API_MODES = frozenset({"stroke_group", "polygon", "hybrid", "component_path"})


def _issue(
    code: str,
    severity: Severity,
    *,
    example_id: str,
    glyph_instance_id: str,
    character: str | None = None,
    region_id: str | None = None,
    transition_id: str | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    o: dict[str, Any] = {
        "code": code,
        "severity": severity,
        "example_id": example_id,
        "glyph_instance_id": glyph_instance_id,
    }
    if character is not None:
        o["character"] = character
    if region_id is not None:
        o["region_id"] = region_id
    if transition_id is not None:
        o["transition_id"] = transition_id
    if detail:
        o["detail"] = detail
    return o


def collect_issues_for_example(row: dict[str, Any]) -> list[dict[str, Any]]:
    """Run all checks on one canonical example dict."""
    issues: list[dict[str, Any]] = []
    ex_id = row.get("example_id") or ""
    gi = row.get("glyph_instance_id") or ""
    ch = row.get("character")

    tpl = row.get("template") or {}
    strokes = row.get("strokes") or []
    stroke_count = len(strokes)

    if tpl.get("missing_template"):
        issues.append(
            _issue("missing_glyph_template", "error", example_id=ex_id, glyph_instance_id=gi, character=ch)
        )
    if not strokes and not tpl.get("missing_template"):
        issues.append(_issue("empty_strokes", "warning", example_id=ex_id, glyph_instance_id=gi, character=ch))
    for i, st in enumerate(strokes):
        med = st.get("median")
        if not med:
            issues.append(
                _issue(
                    "missing_medians",
                    "warning",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    character=ch,
                    detail=f"stroke_id={st.get('stroke_id', i)}",
                )
            )

    if tpl.get("decomposition") in (None, ""):
        issues.append(
            _issue("missing_decomposition", "info", example_id=ex_id, glyph_instance_id=gi, character=ch)
        )
    if tpl.get("matches") in (None, [], ""):
        issues.append(_issue("missing_matches", "info", example_id=ex_id, glyph_instance_id=gi, character=ch))
    rad = tpl.get("radical_strokes")
    if rad is None:
        issues.append(
            _issue("missing_radical_strokes", "info", example_id=ex_id, glyph_instance_id=gi, character=ch)
        )

    if tpl.get("character") and ch and tpl["character"] != ch:
        issues.append(
            _issue(
                "inconsistent_template_character",
                "error",
                example_id=ex_id,
                glyph_instance_id=gi,
                character=ch,
                detail=f"template={tpl['character']!r} instance={ch!r}",
            )
        )

    regions = row.get("regions") or []
    region_ids = {r.get("region_id") for r in regions if r.get("region_id")}

    if not regions:
        issues.append(
            _issue("glyph_instance_without_regions", "info", example_id=ex_id, glyph_instance_id=gi, character=ch)
        )

    stroke_id_sets: list[tuple[str, tuple[int, ...]]] = []
    for reg in regions:
        rid = reg.get("region_id") or ""
        sel_mode = reg.get("selection_mode") or ""
        if sel_mode and sel_mode not in _VALID_API_MODES:
            issues.append(
                _issue(
                    "invalid_selection_mode",
                    "warning",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    character=ch,
                    region_id=rid,
                    detail=sel_mode,
                )
            )

        cj = reg.get("color")
        if cj in (None, {}, ""):
            issues.append(
                _issue("region_missing_color", "error", example_id=ex_id, glyph_instance_id=gi, region_id=rid)
            )
        sj = reg.get("spread")
        if sj in (None, {}, ""):
            issues.append(
                _issue("region_missing_spread", "warning", example_id=ex_id, glyph_instance_id=gi, region_id=rid)
            )
        aj = reg.get("anchor")
        if aj in (None, {}, ""):
            issues.append(
                _issue("region_missing_anchor", "warning", example_id=ex_id, glyph_instance_id=gi, region_id=rid)
            )

        sids = reg.get("stroke_ids") or []
        poly = reg.get("polygon") or []
        if not sids and not poly:
            issues.append(
                _issue("region_empty_selection", "warning", example_id=ex_id, glyph_instance_id=gi, region_id=rid)
            )

        for sid in sids:
            if not isinstance(sid, int) or sid < 0 or sid >= stroke_count:
                issues.append(
                    _issue(
                        "invalid_stroke_ids",
                        "error",
                        example_id=ex_id,
                        glyph_instance_id=gi,
                        region_id=rid,
                        detail=f"stroke_id={sid} stroke_count={stroke_count}",
                    )
                )

        if sel_mode == "polygon" or (poly and not sids):
            if not poly or len(poly) < 3:
                issues.append(
                    _issue(
                        "polygon_empty_or_invalid",
                        "warning",
                        example_id=ex_id,
                        glyph_instance_id=gi,
                        region_id=rid,
                    )
                )

        t = tuple(sorted(sids)) if sids else tuple()
        stroke_id_sets.append((rid, t))

    # duplicate stroke set
    seen: dict[tuple[int, ...], str] = {}
    for rid, t in stroke_id_sets:
        if not t:
            continue
        if t in seen:
            issues.append(
                _issue(
                    "duplicate_region_selection",
                    "warning",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    region_id=rid,
                    detail=f"dup_of_region={seen[t]}",
                )
            )
        else:
            seen[t] = rid

    transitions = row.get("transitions") or []
    if not transitions:
        issues.append(
            _issue(
                "glyph_instance_without_transitions",
                "info",
                example_id=ex_id,
                glyph_instance_id=gi,
                character=ch,
            )
        )

    for tr in transitions:
        tid = tr.get("transition_id") or ""
        src = tr.get("source_region_id")
        tgt = tr.get("target_region_id")
        if not src:
            issues.append(
                _issue(
                    "transition_missing_source",
                    "error",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    transition_id=tid,
                )
            )
        if not tgt:
            issues.append(
                _issue(
                    "transition_missing_target",
                    "error",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    transition_id=tid,
                )
            )
        if src and src not in region_ids:
            issues.append(
                _issue(
                    "dangling_transition",
                    "error",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    transition_id=tid,
                    detail=f"source_region_id={src}",
                )
            )
        if tgt and tgt not in region_ids:
            issues.append(
                _issue(
                    "dangling_transition",
                    "error",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    transition_id=tid,
                    detail=f"target_region_id={tgt}",
                )
            )
        if src and tgt and src == tgt:
            issues.append(
                _issue(
                    "self_loop_transition",
                    "info",
                    example_id=ex_id,
                    glyph_instance_id=gi,
                    transition_id=tid,
                )
            )

        curve = tr.get("curve")
        if curve is not None:
            try:
                json.dumps(curve)
            except (TypeError, ValueError):
                issues.append(
                    _issue(
                        "transition_curve_invalid",
                        "warning",
                        example_id=ex_id,
                        glyph_instance_id=gi,
                        transition_id=tid,
                    )
                )

    return issues


def merge_issue_counts(issues: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for it in issues:
        key = f"{it['code']}:{it['severity']}"
        counts[key] = counts.get(key, 0) + 1
    return counts


def add_template_mismatch_issue(
    issues: list[dict[str, Any]],
    *,
    example_id: str,
    glyph_instance_id: str,
    character: str | None,
) -> None:
    issues.append(
        _issue(
            "template_db_file_mismatch",
            "warning",
            example_id=example_id,
            glyph_instance_id=glyph_instance_id,
            character=character,
            detail="DB template kept; file differed",
        )
    )
