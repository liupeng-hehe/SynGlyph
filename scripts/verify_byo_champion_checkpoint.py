#!/usr/bin/env python3
"""Verify english/letter_sequence champion checkpoint is registered and readable (BYO / shared inference).

Exit code 0 only when describe_active_champion_letter_sequence reports ok.
Uses DATABASE_URL / SYNGLYPH_ML_ENV from the API settings (.env).

Example::

    uv run python scripts/verify_byo_champion_checkpoint.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))

from app.db import SessionLocal  # noqa: E402
from app.services.letter_sequence_checkpoint_resolve import (  # noqa: E402
    describe_active_champion_letter_sequence,
)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--environment",
        default=None,
        help="Override SYNGLYPH_ML_ENV for this check (default: settings.ml_environment)",
    )
    args = ap.parse_args()

    db = SessionLocal()
    try:
        info = describe_active_champion_letter_sequence(db, environment=args.environment)
    finally:
        db.close()

    print(json.dumps(info, indent=2, default=str))
    return 0 if info.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
