"""Chinese annotation product API — /api/chinese/* (isolated from English)."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.chinese import (
    ChineseAnnotationSession,
    ChineseDictionary,
    ChineseGlyphInstance,
    ChineseGlyphTemplate,
    ChineseRegion,
    ChineseTransition,
)
from app.services.chinese_glyph_loader import load_glyph
from app.services.chinese_region_seed import region_seeds_from_template
from app.util.lab_color import average_lab_preview_hex

router = APIRouter(prefix="/api/chinese", tags=["chinese"])

GLYPH_NOT_FOUND_DETAIL = (
    "未找到该字的字形数据。仓库内「福」来自 MakeMeAHanzi；请在本机下载完整笔画库："
    "在仓库根目录执行 pnpm fetch-chinese-graphics（将 graphics.txt 保存到 data/chinese_glyphs/），"
    "或设置环境变量 CHINESE_GRAPHICS_TXT_PATH 指向该文件，然后重启 API。"
)


DEFAULT_DICTIONARY_ID = "a0000000-0000-4000-8000-000000000001"


class ChineseSessionCreate(BaseModel):
    character: str = Field(..., min_length=1, max_length=8)
    dictionary_id: str | None = Field(None, description="字典 ID；省略则使用默认字典")


class ChineseSessionsBulkCreate(BaseModel):
    text: str = Field(..., min_length=1, description="粘贴的中文文本；仅提取其中的汉字并逐字建会话")
    dictionary_id: str = Field(..., min_length=1, description="目标字典 ID")


class ChineseDictionaryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    owner: str = Field("default", max_length=64)


class ChineseRegionCreate(BaseModel):
    glyph_instance_id: str
    name: str = "region"
    label: str | None = None
    selection_mode: str = "stroke_group"
    selection_json: dict[str, Any] | None = None
    stroke_ids_json: list[int] | None = None
    polygon_json: list[dict[str, float]] | None = None
    anchor_json: dict[str, Any] = Field(default_factory=lambda: {"x": 0.5, "y": 0.5})
    color_json: dict[str, Any] = Field(default_factory=lambda: {"space": "lab", "value": [70, 0, 0]})
    spread_json: dict[str, Any] = Field(default_factory=lambda: {"sx": 0.3, "sy": 0.3})
    intensity: float = 1.0
    z_index: int = 0


class ChineseRegionPatch(BaseModel):
    name: str | None = None
    label: str | None = None
    selection_mode: str | None = None
    selection_json: dict[str, Any] | None = None
    stroke_ids_json: list[int] | None = None
    polygon_json: list[dict[str, float]] | None = None
    anchor_json: dict[str, Any] | None = None
    color_json: dict[str, Any] | None = None
    spread_json: dict[str, Any] | None = None
    intensity: float | None = None
    z_index: int | None = None


class ChineseTransitionCreate(BaseModel):
    glyph_instance_id: str
    source_region_id: str
    target_region_id: str
    mode: str = "directed_flow"
    strength: float = 1.0
    width: float = 0.25
    falloff: float = 0.5
    curve_json: dict[str, Any] | None = None
    blend_mode: str | None = None


class ChineseTransitionPatch(BaseModel):
    mode: str | None = None
    strength: float | None = None
    width: float | None = None
    falloff: float | None = None
    curve_json: dict[str, Any] | None = None
    blend_mode: str | None = None


def _region_to_dict(r: ChineseRegion) -> dict[str, Any]:
    return {
        "id": r.id,
        "glyph_instance_id": r.glyph_instance_id,
        "name": r.name,
        "label": r.label,
        "selection_mode": r.selection_mode,
        "selection_json": json.loads(r.selection_json) if r.selection_json else None,
        "stroke_ids_json": json.loads(r.stroke_ids_json) if r.stroke_ids_json else None,
        "polygon_json": json.loads(r.polygon_json) if r.polygon_json else None,
        "anchor_json": json.loads(r.anchor_json or "{}"),
        "color_json": json.loads(r.color_json or "{}"),
        "spread_json": json.loads(r.spread_json or "{}"),
        "intensity": r.intensity,
        "z_index": r.z_index,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _ctr_to_dict(t: ChineseTransition) -> dict[str, Any]:
    return {
        "id": t.id,
        "glyph_instance_id": t.glyph_instance_id,
        "source_region_id": t.source_region_id,
        "target_region_id": t.target_region_id,
        "mode": t.mode,
        "strength": t.strength,
        "width": t.width,
        "falloff": t.falloff,
        "curve_json": json.loads(t.curve_json) if t.curve_json else None,
        "blend_mode": t.blend_mode,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _glyph_instance_to_dict(gi: ChineseGlyphInstance, db: Session) -> dict[str, Any]:
    regions = db.query(ChineseRegion).filter(ChineseRegion.glyph_instance_id == gi.id).order_by(ChineseRegion.z_index).all()
    trs = db.query(ChineseTransition).filter(ChineseTransition.glyph_instance_id == gi.id).all()
    return {
        "id": gi.id,
        "session_id": gi.session_id,
        "template_id": gi.template_id,
        "character": gi.character,
        "transform_json": json.loads(gi.transform_json) if gi.transform_json else None,
        "regions": [_region_to_dict(r) for r in regions],
        "transitions": [_ctr_to_dict(t) for t in trs],
    }


def _session_to_dict(sess: ChineseAnnotationSession, db: Session) -> dict[str, Any]:
    gis = db.query(ChineseGlyphInstance).filter(ChineseGlyphInstance.session_id == sess.id).all()
    return {
        "id": sess.id,
        "dictionary_id": sess.dictionary_id,
        "created_at": sess.created_at.isoformat() if sess.created_at else None,
        "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
        "glyph_instances": [_glyph_instance_to_dict(gi, db) for gi in gis],
    }


def _session_summary(sess: ChineseAnnotationSession, db: Session) -> dict[str, Any]:
    gis = db.query(ChineseGlyphInstance).filter(ChineseGlyphInstance.session_id == sess.id).all()
    gi0 = gis[0] if gis else None
    ch = gi0.character if gi0 else ""
    region_total = 0
    preview_color_hex: str | None = None
    if gi0:
        regions = (
            db.query(ChineseRegion)
            .filter(ChineseRegion.glyph_instance_id == gi0.id)
            .order_by(ChineseRegion.z_index)
            .all()
        )
        region_total = len(regions)
        lab_rows: list[tuple[float, float, float]] = []
        for r in regions:
            try:
                cj = json.loads(r.color_json) if r.color_json else {}
            except json.JSONDecodeError:
                cj = {}
            if cj.get("space") == "lab" and isinstance(cj.get("value"), list) and len(cj["value"]) >= 3:
                v = cj["value"]
                lab_rows.append((float(v[0]), float(v[1]), float(v[2])))
        preview_color_hex = average_lab_preview_hex(lab_rows)
    return {
        "id": sess.id,
        "dictionary_id": sess.dictionary_id,
        "created_at": sess.created_at.isoformat() if sess.created_at else None,
        "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
        "character": ch,
        "region_count": region_total,
        "preview_color_hex": preview_color_hex,
    }


def _resolve_dictionary_id(db: Session, dictionary_id: str | None) -> str:
    if dictionary_id:
        row = db.query(ChineseDictionary).filter(ChineseDictionary.id == dictionary_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Dictionary not found")
        return row.id
    row = db.query(ChineseDictionary).filter(ChineseDictionary.id == DEFAULT_DICTIONARY_ID).first()
    if row:
        return row.id
    # 无迁移旧库：创建默认字典
    d = ChineseDictionary(id=DEFAULT_DICTIONARY_ID, name="默认字典", owner="default")
    db.add(d)
    db.commit()
    db.refresh(d)
    return d.id


_CJK_RE = re.compile(r"[\u3007\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufadf]")


def _extract_cjk_unique_ordered(text: str) -> list[str]:
    """按文中首次出现顺序提取汉字（同一字只出现一次）。"""
    seen: set[str] = set()
    out: list[str] = []
    for m in _CJK_RE.finditer(text):
        ch = m.group()
        if ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out


def _characters_already_in_dictionary(db: Session, dictionary_id: str) -> set[str]:
    sess_ids = [
        s.id
        for s in db.query(ChineseAnnotationSession)
        .filter(ChineseAnnotationSession.dictionary_id == dictionary_id)
        .all()
    ]
    if not sess_ids:
        return set()
    chars: set[str] = set()
    for gi in db.query(ChineseGlyphInstance).filter(ChineseGlyphInstance.session_id.in_(sess_ids)).all():
        if gi.character:
            chars.add(gi.character)
    return chars


def _session_impl_after_tpl(db: Session, ch: str, did: str, tpl: dict[str, Any]) -> dict[str, Any]:
    """在已验证 tpl 存在时创建会话（与 POST /session 主体一致）。"""
    sid = str(uuid.uuid4())
    sess = ChineseAnnotationSession(id=sid, dictionary_id=did)
    db.add(sess)
    db.flush()

    template_row = db.query(ChineseGlyphTemplate).filter(ChineseGlyphTemplate.character == ch).first()
    if not template_row:
        template_row = ChineseGlyphTemplate(
            id=str(uuid.uuid4()),
            character=ch,
            decomposition_json=json.dumps(tpl.get("decomposition")),
            matches_json=json.dumps(tpl.get("matches")),
            strokes_json=json.dumps(tpl["strokes"]),
            medians_json=json.dumps(tpl["medians"]),
        )
        db.add(template_row)
        db.flush()

    gid = str(uuid.uuid4())
    gi = ChineseGlyphInstance(
        id=gid,
        session_id=sid,
        template_id=template_row.id,
        character=ch,
    )
    db.add(gi)
    db.commit()
    db.refresh(sess)
    return _session_to_dict(sess, db)


@router.get("/health")
def chinese_health():
    return {"product": "chinese", "status": "ok"}


@router.get("/dictionaries")
def list_chinese_dictionaries(
    owner: str | None = Query(None, description="按 owner 过滤；默认返回全部"),
    db: Session = Depends(get_db),
):
    q = db.query(ChineseDictionary).order_by(ChineseDictionary.created_at.desc())
    if owner is not None:
        q = q.filter(ChineseDictionary.owner == owner)
    rows = q.all()
    return [{"id": r.id, "name": r.name, "owner": r.owner, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.post("/dictionaries")
def create_chinese_dictionary(body: ChineseDictionaryCreate, db: Session = Depends(get_db)):
    did = str(uuid.uuid4())
    d = ChineseDictionary(id=did, name=body.name.strip(), owner=body.owner.strip() or "default")
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "name": d.name, "owner": d.owner, "created_at": d.created_at.isoformat() if d.created_at else None}


@router.get("/sessions")
def list_chinese_sessions(
    dictionary_id: str = Query(..., description="字典 ID"),
    db: Session = Depends(get_db),
):
    d = db.query(ChineseDictionary).filter(ChineseDictionary.id == dictionary_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dictionary not found")
    sessions = (
        db.query(ChineseAnnotationSession)
        .filter(ChineseAnnotationSession.dictionary_id == dictionary_id)
        .order_by(ChineseAnnotationSession.updated_at.desc())
        .all()
    )
    return [_session_summary(s, db) for s in sessions]


@router.get("/glyph/{char}")
def get_chinese_glyph(char: str):
    if not char or len(char) > 1:
        raise HTTPException(status_code=400, detail="Provide a single character")
    template = load_glyph(char)
    if not template:
        raise HTTPException(status_code=404, detail=GLYPH_NOT_FOUND_DETAIL)
    seeds = region_seeds_from_template(template)
    return {"template": template, "seed_regions": seeds}


@router.post("/session")
def create_chinese_session(body: ChineseSessionCreate, db: Session = Depends(get_db)):
    ch = body.character.strip()
    if len(ch) != 1:
        raise HTTPException(status_code=400, detail="character must be exactly one character")
    tpl = load_glyph(ch)
    if not tpl:
        raise HTTPException(status_code=404, detail=GLYPH_NOT_FOUND_DETAIL)

    did = _resolve_dictionary_id(db, body.dictionary_id)
    return _session_impl_after_tpl(db, ch, did, tpl)


@router.post("/sessions/bulk")
def bulk_create_chinese_sessions(body: ChineseSessionsBulkCreate, db: Session = Depends(get_db)):
    """粘贴一段文本，提取汉字并按首次出现顺序逐字加入当前字典（已有该字的会话则跳过；无字形数据的字跳过并列出）。"""
    did = _resolve_dictionary_id(db, body.dictionary_id.strip())
    chars = _extract_cjk_unique_ordered(body.text)
    existing = _characters_already_in_dictionary(db, did)
    created = 0
    skipped_duplicate = 0
    skipped_no_glyph: list[str] = []
    server_errors: list[str] = []
    for ch in chars:
        if ch in existing:
            skipped_duplicate += 1
            continue
        tpl = load_glyph(ch)
        if not tpl:
            skipped_no_glyph.append(ch)
            continue
        try:
            _session_impl_after_tpl(db, ch, did, tpl)
            created += 1
            existing.add(ch)
        except Exception as e:  # noqa: BLE001
            db.rollback()
            server_errors.append(f"{ch}: {e!s}")
    return {
        "created": created,
        "skipped_duplicate": skipped_duplicate,
        "skipped_no_glyph": skipped_no_glyph,
        "extracted": chars,
        "server_errors": server_errors,
    }


@router.delete("/session/{session_id}")
def delete_chinese_session(
    session_id: str,
    dictionary_id: str = Query(..., description="必须与该会话所属字典一致，防止误删"),
    db: Session = Depends(get_db),
):
    """删除一条汉字标注会话（级联删除字形实例、区域、过渡）。"""
    sess = db.query(ChineseAnnotationSession).filter(ChineseAnnotationSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.dictionary_id != dictionary_id:
        raise HTTPException(status_code=403, detail="Session does not belong to this dictionary")
    db.delete(sess)
    db.commit()
    return {"ok": True}


@router.get("/session/{session_id}")
def get_chinese_session(session_id: str, db: Session = Depends(get_db)):
    sess = db.query(ChineseAnnotationSession).filter(ChineseAnnotationSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_dict(sess, db)


@router.post("/region")
def create_chinese_region(body: ChineseRegionCreate, db: Session = Depends(get_db)):
    gi = db.query(ChineseGlyphInstance).filter(ChineseGlyphInstance.id == body.glyph_instance_id).first()
    if not gi:
        raise HTTPException(status_code=404, detail="Glyph instance not found")
    rid = str(uuid.uuid4())
    r = ChineseRegion(
        id=rid,
        glyph_instance_id=body.glyph_instance_id,
        name=body.name,
        label=body.label,
        selection_mode=body.selection_mode,
        selection_json=json.dumps(body.selection_json) if body.selection_json is not None else None,
        stroke_ids_json=json.dumps(body.stroke_ids_json) if body.stroke_ids_json is not None else None,
        polygon_json=json.dumps(body.polygon_json) if body.polygon_json is not None else None,
        anchor_json=json.dumps(body.anchor_json),
        color_json=json.dumps(body.color_json),
        spread_json=json.dumps(body.spread_json),
        intensity=body.intensity,
        z_index=body.z_index,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _region_to_dict(r)


@router.patch("/region/{region_id}")
def patch_chinese_region(region_id: str, body: ChineseRegionPatch, db: Session = Depends(get_db)):
    r = db.query(ChineseRegion).filter(ChineseRegion.id == region_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Region not found")
    if body.name is not None:
        r.name = body.name
    if body.label is not None:
        r.label = body.label
    if body.selection_mode is not None:
        r.selection_mode = body.selection_mode
    if body.selection_json is not None:
        r.selection_json = json.dumps(body.selection_json)
    if body.stroke_ids_json is not None:
        r.stroke_ids_json = json.dumps(body.stroke_ids_json)
    if body.polygon_json is not None:
        r.polygon_json = json.dumps(body.polygon_json)
    if body.anchor_json is not None:
        r.anchor_json = json.dumps(body.anchor_json)
    if body.color_json is not None:
        r.color_json = json.dumps(body.color_json)
    if body.spread_json is not None:
        r.spread_json = json.dumps(body.spread_json)
    if body.intensity is not None:
        r.intensity = body.intensity
    if body.z_index is not None:
        r.z_index = body.z_index
    db.commit()
    db.refresh(r)
    return _region_to_dict(r)


@router.delete("/region/{region_id}")
def delete_chinese_region(region_id: str, db: Session = Depends(get_db)):
    r = db.query(ChineseRegion).filter(ChineseRegion.id == region_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Region not found")
    db.query(ChineseTransition).filter(
        or_(
            ChineseTransition.source_region_id == region_id,
            ChineseTransition.target_region_id == region_id,
        )
    ).delete(synchronize_session=False)
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/transition")
def create_chinese_transition(body: ChineseTransitionCreate, db: Session = Depends(get_db)):
    gi = db.query(ChineseGlyphInstance).filter(ChineseGlyphInstance.id == body.glyph_instance_id).first()
    if not gi:
        raise HTTPException(status_code=404, detail="Glyph instance not found")
    sr = db.query(ChineseRegion).filter(ChineseRegion.id == body.source_region_id).first()
    tgt = db.query(ChineseRegion).filter(ChineseRegion.id == body.target_region_id).first()
    if not sr or not tgt:
        raise HTTPException(status_code=404, detail="Region not found")
    if sr.glyph_instance_id != gi.id or tgt.glyph_instance_id != gi.id:
        raise HTTPException(status_code=400, detail="Regions must belong to the glyph instance")
    tid = str(uuid.uuid4())
    t = ChineseTransition(
        id=tid,
        glyph_instance_id=body.glyph_instance_id,
        source_region_id=body.source_region_id,
        target_region_id=body.target_region_id,
        mode=body.mode,
        strength=body.strength,
        width=body.width,
        falloff=body.falloff,
        curve_json=json.dumps(body.curve_json) if body.curve_json else None,
        blend_mode=body.blend_mode,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _ctr_to_dict(t)


@router.patch("/transition/{transition_id}")
def patch_chinese_transition(transition_id: str, body: ChineseTransitionPatch, db: Session = Depends(get_db)):
    t = db.query(ChineseTransition).filter(ChineseTransition.id == transition_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transition not found")
    if body.mode is not None:
        t.mode = body.mode
    if body.strength is not None:
        t.strength = body.strength
    if body.width is not None:
        t.width = body.width
    if body.falloff is not None:
        t.falloff = body.falloff
    if body.curve_json is not None:
        t.curve_json = json.dumps(body.curve_json)
    if body.blend_mode is not None:
        t.blend_mode = body.blend_mode
    db.commit()
    db.refresh(t)
    return _ctr_to_dict(t)


@router.delete("/transition/{transition_id}")
def delete_chinese_transition(transition_id: str, db: Session = Depends(get_db)):
    t = db.query(ChineseTransition).filter(ChineseTransition.id == transition_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transition not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
