"""Startup validation (non-fatal): log ambiguous ML deployments if DB predates constraints."""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.db import SessionLocal, settings

logger = logging.getLogger(__name__)


def run_startup_ml_checks() -> None:
    try:
        from app.services.colorrec_retrieval import colorrec_status

        cr = colorrec_status()
        if cr.get("ready"):
            logger.info(
                "colorrec retrieval ready (model=%s, embeddings=%s)",
                cr.get("model_path"),
                cr.get("embeddings_path"),
            )
        elif cr.get("enabled"):
            logger.warning(
                "colorrec enabled but not ready (missing=%s)",
                cr.get("missing"),
            )
    except Exception:
        logger.exception("colorrec startup check failed (non-fatal)")

    if "sqlite" in settings.database_url:
        return
    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                "SELECT environment, product_line, task_name, alias, COUNT(*) AS c "
                "FROM ml_deployment WHERE is_active = 1 "
                "GROUP BY environment, product_line, task_name, alias "
                "HAVING COUNT(*) > 1"
            )
        ).fetchall()
        if rows:
            logger.warning(
                "ml_deployment has multiple active rows for the same alias (fix before relying on champion): %s",
                [tuple(r) for r in rows],
            )

        from app.services.letter_sequence_checkpoint_resolve import describe_active_champion_letter_sequence

        byo = describe_active_champion_letter_sequence(db)
        if byo.get("ok"):
            logger.info(
                "BYO / letter_sequence champion checkpoint OK (env=%s, path=%s)",
                byo.get("environment"),
                byo.get("checkpoint_uri"),
            )
        else:
            logger.warning(
                "BYO / letter_sequence champion not usable (reason=%s): %s",
                byo.get("reason"),
                byo.get("detail"),
            )
    except Exception:
        logger.exception("startup_ml_checks failed (non-fatal)")
    finally:
        db.close()
