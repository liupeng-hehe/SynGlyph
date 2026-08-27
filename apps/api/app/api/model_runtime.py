"""Stable checkpoint manifest, ONNX export, and parity (mutations gated by settings)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.mutation_guards import enable_model_runtime_mutations
from app.services.stable_checkpoints import (
    load_stable_manifest,
    stable_checkpoints_path,
)


router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/checkpoints")
def list_stable_checkpoints():
    """List manifest entries; UI filters ``is_stable`` on the client."""
    path = stable_checkpoints_path()
    if not path.is_file():
        return {"manifest_path": str(path), "checkpoints": [], "error": "manifest not found"}
    cps: list[dict[str, Any]] = []
    for c in load_stable_manifest():
        cps.append(c.to_api_dict())
    return {
        "manifest_path": str(path),
        "checkpoints": cps,
    }


class ExportOnnxBody(BaseModel):
    checkpoint_id: str
    output_dir: str | None = Field(
        default=None, description="Directory for model.onnx (default: <checkpoint_parent>/onnx_runtime)"
    )
    opset: int = 14


@router.post("/export-onnx")
def export_onnx(body: ExportOnnxBody):
    if not enable_model_runtime_mutations():
        raise HTTPException(
            status_code=403, detail="Set ENABLE_MODEL_RUNTIME_MUTATIONS=1 to enable export-onnx"
        )
    from app.services.stable_checkpoints import get_stable_by_id
    from letter_sequence.onnx.export_bilstm import export_bilstm_to_onnx

    sc = get_stable_by_id(body.checkpoint_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Unknown checkpoint_id")
    if not sc.pt_exists:
        raise HTTPException(status_code=400, detail=f"Checkpoint file missing: {sc.path}")
    if sc.model_family != "bilstm":
        raise HTTPException(status_code=400, detail="Only bilstm is supported for ONNX export")
    out = Path(body.output_dir).expanduser() if body.output_dir else sc.path.parent / "onnx_runtime"
    out.mkdir(parents=True, exist_ok=True)
    try:
        report = export_bilstm_to_onnx(sc.path, out, opset=body.opset, dry_run=False)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Export failed: {e!s}") from e
    return {"ok": True, "output_dir": str(out), "report": report}


class ParityTestBody(BaseModel):
    checkpoint_id: str
    onnx_dir: str | None = Field(default=None, description="Directory with model.onnx (default: manifest onnx_dir or beside checkpoint)")
    words: str | None = Field(default=None, description="Comma-separated test words")
    max_mean: float = 1e-3
    max_max: float = 1e-2
    write_report: bool = True


@router.post("/parity-test")
def parity_test(body: ParityTestBody):
    if not enable_model_runtime_mutations():
        raise HTTPException(
            status_code=403, detail="Set ENABLE_MODEL_RUNTIME_MUTATIONS=1 to enable parity-test"
        )
    from app.services.stable_checkpoints import get_stable_by_id
    from letter_sequence.onnx.parity_check import run_parity_check

    sc = get_stable_by_id(body.checkpoint_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Unknown checkpoint_id")
    if not sc.pt_exists:
        raise HTTPException(status_code=400, detail=f"Checkpoint file missing: {sc.path}")
    odir = Path(body.onnx_dir).expanduser() if body.onnx_dir else (sc.onnx_dir or sc.path.parent / "onnx_runtime")
    if not odir.is_dir() or not (odir / "model.onnx").is_file():
        raise HTTPException(status_code=400, detail=f"ONNX directory invalid or model.onnx missing: {odir}")
    wlist = [w.strip() for w in (body.words or "").split(",") if w.strip()] if body.words else None
    out_dir = odir
    try:
        result = run_parity_check(
            sc.path,
            odir,
            words=wlist,
            max_mean=body.max_mean,
            max_max=body.max_max,
            write_dir=out_dir if body.write_report else None,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Parity test failed: {e!s}") from e
    return {"ok": True, "result": result}
