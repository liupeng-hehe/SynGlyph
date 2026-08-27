#!/usr/bin/env python3
"""Populate metric_fact and workflow_metrics_snapshot from DB + artifacts/experiments."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))
os.chdir(_API)

import app.models  # noqa: F401, E402 — register ORM tables
from app.db import SessionLocal  # noqa: E402
from app.services.metrics_rollup import rollup_all  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Roll up HITL metrics into metric_fact / workflow tables.")
    ap.add_argument("--eval-limit", type=int, default=500)
    ap.add_argument("--vs-prev-limit", type=int, default=200)
    ap.add_argument("--experiment-files", type=int, default=100)
    ap.add_argument("--workflow-days", type=float, default=7.0)
    args = ap.parse_args()

    db = SessionLocal()
    try:
        out = rollup_all(
            db,
            eval_limit=args.eval_limit,
            vs_prev_limit=args.vs_prev_limit,
            experiment_files=args.experiment_files,
            workflow_days=args.workflow_days,
        )
        db.commit()
        print(out)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
