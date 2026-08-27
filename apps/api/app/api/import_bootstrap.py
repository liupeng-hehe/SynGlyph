from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.import_pipeline import run_bootstrap_import

router = APIRouter(prefix="/api/import", tags=["import"])

# In-memory status (could move to DB later)
_last_import_status: dict | None = None


@router.post("/bootstrap")
def bootstrap_import(db: Session = Depends(get_db)):
    global _last_import_status
    try:
        result = run_bootstrap_import(db)
        _last_import_status = {
            "status": "success",
            "created": result["created"],
            "skipped": result["skipped"],
            "selected_count": result["selected_count"],
            "pool_size": result["pool_size"],
            "timestamp": datetime.utcnow().isoformat(),
        }
        return _last_import_status
    except Exception as e:
        _last_import_status = {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }
        raise


@router.get("/status")
def get_import_status():
    return _last_import_status or {"status": "never_run"}
