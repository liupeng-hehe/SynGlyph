#!/usr/bin/env python3
"""Promote a model snapshot to active champion deployment (single transaction)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))

from app.db import SessionLocal, settings  # noqa: E402
from app.services.ml_deployment_service import promote_model_snapshot  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-snapshot-id", required=True)
    ap.add_argument("--environment", default=None, help="Default: SYNGLYPH_ML_ENV or 'dev'")
    ap.add_argument("--product-line", default="english")
    ap.add_argument("--task-name", default="letter_sequence")
    ap.add_argument("--alias", default="champion")
    ap.add_argument("--dataset-version-id", default=None)
    ap.add_argument("--notes", default=None)
    args = ap.parse_args()

    env = args.environment or settings.ml_environment
    db = SessionLocal()
    try:
        dep = promote_model_snapshot(
            db,
            model_snapshot_id=args.model_snapshot_id,
            environment=env,
            product_line=args.product_line,
            task_name=args.task_name,
            alias=args.alias,
            dataset_version_id=args.dataset_version_id,
            notes=args.notes,
        )
        print(dep.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()
