from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
os.environ.setdefault("PYTHONPATH", str(API_ROOT))
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.db import SessionLocal
from app.services.pattern_supply.offline_index_store import (
    activate_version,
    get_rebuild_job,
    run_rebuild_job,
    start_manual_rebuild,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual rebuild for offline Pattern Supply index")
    parser.add_argument("--corpus-path", default=None)
    parser.add_argument("--corpus-name", default="general_web")
    parser.add_argument("--version", default=None)
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        job = start_manual_rebuild(
            db,
            corpus_path=args.corpus_path,
            corpus_name=args.corpus_name,
            version_label=args.version,
        )
        job = run_rebuild_job(db, job_id=job.id)
        print(f"job_id={job.id} status={job.status} message={job.message}")
        if job.status != "succeeded":
            return 1
        if args.activate:
            row = get_rebuild_job(db, job_id=job.id)
            if row and row.version_id:
                from app.models.offline_index_version import OfflineIndexVersion

                v = db.query(OfflineIndexVersion).filter(OfflineIndexVersion.id == row.version_id).first()
                if v:
                    activate_version(db, version=v.version)
                    print(f"activated version={v.version}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

