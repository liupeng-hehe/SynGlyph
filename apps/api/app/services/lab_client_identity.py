"""Stable participant key: same display name + same client address → same lab profile."""

from __future__ import annotations

import hashlib

from starlette.requests import Request


def normalize_lab_display_name(display_name: str) -> str:
    """Lowercase, collapse internal whitespace (allows matching "Lvlvmei" vs "lvlvmei")."""
    return " ".join((display_name or "").strip().lower().split())


def client_ip_from_request(request: Request) -> str:
    """Best-effort client IP (supports X-Forwarded-For when behind a reverse proxy)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def lab_participant_key(display_name: str, client_ip: str) -> str:
    """
    Deterministic id for (normalized name, address). Different IPs → different keys →
    different profiles with the same visible name allowed.
    """
    norm = normalize_lab_display_name(display_name)
    payload = f"{norm}\x00{client_ip}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
