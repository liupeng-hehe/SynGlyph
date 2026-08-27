#!/usr/bin/env python3
"""CLI: freeze Chinese canonical dataset -> ml_dataset_version + artifacts/datasets/{id}/."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_REPO / 'synglyph.db'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task-name", default="glyph_region_annotation")
    ap.add_argument(
        "--source-cutoff-at",
        default=None,
        help="ISO8601 datetime; only instances with updated_at <= this are exported.",
    )
    args = ap.parse_args()

    cutoff = None
    if args.source_cutoff_at:
        cutoff = datetime.fromisoformat(args.source_cutoff_at.replace("Z", "+00:00"))
        if cutoff.tzinfo is None:
            cutoff = cutoff.replace(tzinfo=timezone.utc)

    from app.db import SessionLocal
    from app.services.chinese_dataset_export import freeze_chinese_dataset_version

    db = SessionLocal()
    try:
        row = freeze_chinese_dataset_version(
            db,
            task_name=args.task_name,
            source_cutoff_at=cutoff,
            created_by_run_id=None,
        )
        from app.services.artifact_paths import dataset_version_dir

        out = dataset_version_dir(row.id)
        print("dataset_version_id:", row.id)
        print("dataset_hash:", row.dataset_hash)
        print("artifact_dir:", out)
        print("manifest_uri:", row.manifest_uri)
    finally:
        db.close()


if __name__ == "__main__":
    main()
