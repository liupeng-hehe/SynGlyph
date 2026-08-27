"""Participant identity: unique slug per display name for lab profiles."""

from __future__ import annotations

import re
import secrets

from sqlalchemy.orm import Session

from app.models.lab_profile import LabProfile


def allocate_unique_slug(db: Session, display_name: str) -> str:
    raw = (display_name or "").strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:28] or "palette"
    for _ in range(16):
        suf = secrets.token_hex(2)
        slug = f"{base}-{suf}"
        taken = db.query(LabProfile.id).filter(LabProfile.slug == slug).first()
        if not taken:
            return slug
    return f"{base}-{secrets.token_hex(8)}"


def clamp_lab(l: float, a: float, b: float) -> tuple[float, float, float]:
    return (
        max(0.0, min(100.0, float(l))),
        max(-128.0, min(127.0, float(a))),
        max(-128.0, min(127.0, float(b))),
    )
