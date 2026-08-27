"""Load ``configs/letter_sequence/stable_checkpoints.json`` for deploy validation UI."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.db import settings


def _repo_root() -> Path:
    # app/services/ -> app -> api -> apps -> repo
    return Path(__file__).resolve().parents[4]


def stable_checkpoints_path() -> Path:
    p = (settings.stable_checkpoints_path or "").strip()
    if p:
        return Path(p).expanduser().resolve()
    return _repo_root() / "configs" / "letter_sequence" / "stable_checkpoints.json"


@dataclass
class StableCheckpoint:
    checkpoint_id: str
    path: Path
    model_family: str
    is_stable: bool
    config_path: str | None
    has_onnx: bool
    onnx_path: Path | None
    onnx_dir: Path | None
    parity_status: str
    parity_report_path: Path | None
    notes: str
    raw: dict[str, Any]

    @property
    def pt_exists(self) -> bool:
        return self.path.is_file()

    @property
    def onnx_file_exists(self) -> bool:
        return bool(self.onnx_path and self.onnx_path.is_file())

    @property
    def export_report_path(self) -> Path | None:
        if not self.onnx_dir:
            return None
        p = self.onnx_dir / "export_report.json"
        return p if p.is_file() else None

    @property
    def export_time_iso(self) -> str | None:
        er = self.export_report_path
        if not er:
            return None
        try:
            d = json.loads(er.read_text(encoding="utf-8"))
            return d.get("exported_at")
        except OSError:
            return None

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "checkpoint_id": self.checkpoint_id,
            "path": str(self.path),
            "model_family": self.model_family,
            "is_stable": self.is_stable,
            "config_path": self.config_path,
            "has_onnx": self.has_onnx and self.onnx_file_exists,
            "parity_status": self.parity_status,
            "onnx_path": str(self.onnx_path) if self.onnx_path else None,
            "onnx_dir": str(self.onnx_dir) if self.onnx_dir else None,
            "parity_report_path": str(self.parity_report_path) if self.parity_report_path else None,
            "pytorch_available": self.pt_exists,
            "export_time": self.export_time_iso,
            "notes": self.notes,
        }


def _resolve_path(s: str | None) -> Path | None:
    if not s or not str(s).strip():
        return None
    p = Path(s.strip()).expanduser()
    if p.is_absolute():
        return p.resolve()
    return (_repo_root() / p).resolve()


def load_stable_manifest() -> list[StableCheckpoint]:
    path = stable_checkpoints_path()
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[StableCheckpoint] = []
    for row in data.get("checkpoints", []):
        pt = _resolve_path(row.get("path"))
        onx = _resolve_path(row.get("onnx_path")) if row.get("onnx_path") else None
        odir = _resolve_path(row.get("onnx_dir")) if row.get("onnx_dir") else None
        if onx and not odir:
            odir = onx.parent
        if not onx and odir:
            candidate = odir / "model.onnx"
            if candidate.is_file():
                onx = candidate
        prp = _resolve_path(row.get("parity_report_path")) if row.get("parity_report_path") else None
        if prp and not prp.is_file():
            prp = odir / "parity_report.json" if odir and (odir / "parity_report.json").is_file() else prp
        has_onnx = bool(row.get("has_onnx", False) or (onx and onx.is_file()))
        out.append(
            StableCheckpoint(
                checkpoint_id=str(row.get("checkpoint_id", "")),
                path=pt or Path("/nonexistent/missing.pt"),
                model_family=str(row.get("model_family", "bilstm")),
                is_stable=bool(row.get("is_stable", False)),
                config_path=row.get("config_path"),
                has_onnx=has_onnx,
                onnx_path=onx,
                onnx_dir=odir,
                parity_status=str(row.get("parity_status", "unknown")),
                parity_report_path=prp,
                notes=str(row.get("notes", "")),
                raw=row,
            )
        )
    return out


def get_stable_by_id(checkpoint_id: str) -> StableCheckpoint | None:
    for c in load_stable_manifest():
        if c.checkpoint_id == checkpoint_id:
            return c
    return None
