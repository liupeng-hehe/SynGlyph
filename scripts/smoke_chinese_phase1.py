#!/usr/bin/env python3
"""Minimal smoke: export Chinese dataset if DB has instances; else skip with message."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_REPO / 'synglyph.db'}")


def main() -> None:
    import app.models  # noqa: F401
    from app.db import SessionLocal
    from app.models.chinese import ChineseGlyphInstance
    from app.services.chinese_dataset_export import freeze_chinese_dataset_version
    from app.services.artifact_paths import dataset_version_dir

    db = SessionLocal()
    try:
        n = db.query(ChineseGlyphInstance).count()
        if n == 0:
            print("smoke_chinese_phase1: no chinese_glyph_instances — skip export (exit 0)")
            return
        row = freeze_chinese_dataset_version(db, source_cutoff_at=None, created_by_run_id=None)
        out = dataset_version_dir(row.id)
        stats_path = out / "stats.json"
        qual_path = out / "quality_report.json"
        print("dataset_version_id:", row.id)
        print("artifact_dir:", out)
        assert (out / "examples.jsonl").is_file()
        assert stats_path.is_file()
        assert qual_path.is_file()
        print("stats.json preview:", stats_path.read_text(encoding="utf-8")[:1200])
        print("quality_report summary:", qual_path.read_text(encoding="utf-8")[:800])
    finally:
        db.close()


if __name__ == "__main__":
    main()
