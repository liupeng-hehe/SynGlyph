"""Color semantic retrieval — fine-tuned sentence-transformer over candidate bank."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.colorrec_retrieval import colorrec_status, retrieve_colors

router = APIRouter(prefix="/api/colorrec", tags=["colorrec"])


class RetrieveBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    top_k: int | None = Field(default=None, ge=1, le=32)


@router.get("/health")
def colorrec_health():
    return colorrec_status()


@router.post("/retrieve")
def colorrec_retrieve(body: RetrieveBody):
    status = colorrec_status()
    if not status.get("enabled"):
        raise HTTPException(status_code=503, detail="colorrec is disabled")
    if not status.get("ready"):
        raise HTTPException(
            status_code=503,
            detail={
                "message": "colorrec assets not ready",
                "missing": status.get("missing", []),
                "model_path": status.get("model_path"),
                "embeddings_path": status.get("embeddings_path"),
            },
        )
    try:
        results = retrieve_colors(body.query, top_k=body.top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"colorrec dependencies missing: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"colorrec retrieve failed: {exc}") from exc

    return {
        "query": body.query.strip(),
        "top_k": body.top_k or status.get("top_k_default", 8),
        "results": results,
        "model_path": status.get("model_path"),
    }
