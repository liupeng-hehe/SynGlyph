"""Deactivate duplicate active ml_deployment rows; keep newest per (env, product, task, alias)."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.engine import Connection


def dedupe_active_ml_deployments(conn: Connection) -> None:
    rows = conn.execute(
        text(
            "SELECT id, environment, product_line, task_name, alias, created_at "
            "FROM ml_deployment WHERE is_active = true"
        )
    ).fetchall()
    by_key: dict[tuple[str, str, str, str], list] = defaultdict(list)
    for r in rows:
        by_key[(r[1], r[2], r[3], r[4])].append((r[0], r[5]))

    for _key, lst in by_key.items():
        if len(lst) <= 1:
            continue
        lst.sort(key=lambda x: (x[1] is None, x[1]), reverse=True)
        for dup_id, _ in lst[1:]:
            conn.execute(text("UPDATE ml_deployment SET is_active = false WHERE id = :id"), {"id": dup_id})
