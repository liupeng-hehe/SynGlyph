"""Recommend validation check words for BYO lab (lightweight AL)."""

from __future__ import annotations

import json
import logging
import random
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.lab_profile import LabEvaluationCheck, LabProfile
from app.services.kb_analytics.rebuild import get_active_vocab_version_id
from app.services.kb_analytics.scoring import kb_pattern_gap_score_for_text
from app.services.lab_manifest import checks_for_coverage_words, parse_manifest
from app.services.lab_dataset import write_samples_jsonl
from app.utils.repo_root import get_repo_root

logger = logging.getLogger(__name__)

_CHECK_COUNT = 10


def _labeled_texts(profile: LabProfile) -> list[str]:
    texts: list[str] = []
    for row in profile.coverage_words:
        if row.completed:
            texts.append(row.word.lower())
    for row in profile.letters:
        if row.annotated:
            texts.append(row.char.lower())
    return texts


def _candidate_pool(db: Session, profile: LabProfile, *, limit: int = 200) -> list[str]:
    m = parse_manifest(profile)
    exclude = {w.lower() for w in m.coverage_words}
    vid = profile.coverage_kb_vocab_version_id or get_active_vocab_version_id(db)
    candidates: list[str] = []
    if vid:
        from app.models import KbWord

        rows = (
            db.query(KbWord.normalized_word)
            .filter(KbWord.vocab_version_id == vid)
            .limit(limit * 3)
            .all()
        )
        for (w,) in rows:
            wl = (w or "").strip().lower()
            if not wl or wl in exclude or len(wl) > 15:
                continue
            candidates.append(wl)
            if len(candidates) >= limit:
                break
    if len(candidates) < _CHECK_COUNT:
        from app.services.lab_manifest import _CHECK_POOL, _COVERAGE_POOL

        for w in _CHECK_POOL + _COVERAGE_POOL:
            wl = w.lower()
            if wl not in exclude and wl not in candidates:
                candidates.append(wl)
    return candidates


def _score_candidates(
    db: Session,
    profile: LabProfile,
    candidates: list[str],
    *,
    checkpoint_path: Path | None,
    vocab_version_id: str | None = None,
) -> list[dict[str, Any]]:
    labeled = _labeled_texts(profile)
    rows: list[dict[str, Any]] = []
    unc_map: dict[str, float] = {}
    if checkpoint_path and checkpoint_path.is_file():
        try:
            import torch
            from letter_sequence.al.batch_uncertainty import batch_uncertainty_for_texts
            from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
            from letter_sequence.training.io import load_checkpoint

            ckpt = load_checkpoint(checkpoint_path, map_location="cpu")
            cfg = ckpt.get("config") or {}
            model = letter_sequence_model_from_config(cfg)
            model.load_state_dict(ckpt["model_state"])
            model.eval()
            pairs = batch_uncertainty_for_texts(model, candidates, device=torch.device("cpu"))
            for text, (bu, _au) in zip(candidates, pairs):
                unc_map[text] = float(bu)
        except Exception:
            logger.debug("validation AL uncertainty failed", exc_info=True)

    try:
        from letter_sequence.al.text_stats import build_unit_counts_from_texts, segment_novelty_score
    except ImportError:
        build_unit_counts_from_texts = None  # type: ignore[misc,assignment]
        segment_novelty_score = None  # type: ignore[misc,assignment]

    unit_counts = build_unit_counts_from_texts(labeled) if build_unit_counts_from_texts else {}

    for text in candidates:
        bu = unc_map.get(text, 0.5)
        kb_gap = 0.0
        if vocab_version_id:
            try:
                kb_gap = float(kb_pattern_gap_score_for_text(db, text, vocab_version_id))
            except Exception:
                kb_gap = 0.0
        novelty = 0.0
        if segment_novelty_score and unit_counts:
            try:
                novelty = float(segment_novelty_score(text, unit_counts))
            except Exception:
                novelty = 0.0
        score = 0.4 * bu + 0.35 * kb_gap + 0.25 * novelty
        rows.append(
            {
                "text": text,
                "stimulus_id": f"lab_val:{profile.id}:{text}",
                "boundary_uncertainty": bu,
                "segment_attribute_uncertainty": 0.0,
                "segment_novelty": novelty,
                "coverage_gain": kb_gap,
                "instability": 0.0,
                "score": score,
            }
        )
    rows.sort(key=lambda r: -float(r["score"]))
    return rows


def _diversify_pick(scored: list[dict[str, Any]], k: int) -> list[str]:
    """Simple diversity: prefer words with distinct first char."""
    picked: list[str] = []
    seen_first: set[str] = set()
    for row in scored:
        t = str(row["text"])
        fc = t[0] if t else "?"
        if fc in seen_first and len(picked) < k - 2:
            continue
        picked.append(t)
        seen_first.add(fc)
        if len(picked) >= k:
            break
    for row in scored:
        if len(picked) >= k:
            break
        t = str(row["text"])
        if t not in picked:
            picked.append(t)
    return picked[:k]


def micro_train_checkpoint_path(profile_id: str) -> Path:
    return (get_repo_root() / "data" / "lab_training_runs" / f"{profile_id}_micro" / "letter_sequence.pt").resolve()


def run_micro_train(db: Session, profile: LabProfile) -> Path | None:
    """Quick 8-epoch train on 30 coverage words; does not set active_checkpoint_uri."""
    import os
    import subprocess
    import sys

    out_dir = micro_train_checkpoint_path(profile.id).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    samples_path = out_dir / "letter_sequence_samples.jsonl"
    n = write_samples_jsonl(db, profile, samples_path)
    if n < 10:
        return None
    from app.services.lab_train_worker import _build_lab_train_yaml, lab_micro_train_epochs

    _build_lab_train_yaml(out_dir, int(profile.seed), epochs=lab_micro_train_epochs())
    repo_root = get_repo_root()
    env = os.environ.copy()
    pkg = repo_root / "packages" / "letter_sequence"
    prev = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(pkg) + (os.pathsep + prev if prev else "")
    train_cmd = [
        sys.executable,
        str(repo_root / "scripts" / "train_letter_sequence_model.py"),
        "--config",
        str(out_dir / "run_config.yaml"),
        "--samples-jsonl",
        str(samples_path),
        "--out-dir",
        str(out_dir),
        "--epochs",
        str(lab_micro_train_epochs()),
    ]
    try:
        proc = subprocess.run(train_cmd, cwd=str(repo_root), env=env, capture_output=True, timeout=600)
        if proc.returncode != 0:
            logger.warning("micro-train failed: %s", proc.stderr.decode("utf-8", errors="replace")[:500])
            return None
    except Exception:
        logger.exception("micro-train subprocess failed")
        return None
    ckpt = out_dir / "letter_sequence.pt"
    return ckpt if ckpt.is_file() else None


def recommend_validation_checks(db: Session, profile: LabProfile) -> list[dict[str, str]]:
    """Pick 10 validation words; persist checks_json + LabEvaluationCheck rows."""
    m = parse_manifest(profile)
    if m.checks:
        return m.checks

    ckpt = run_micro_train(db, profile)
    if ckpt is None:
        ckpt = micro_train_checkpoint_path(profile.id)
        if not ckpt.is_file():
            ckpt = None

    vid = profile.coverage_kb_vocab_version_id or get_active_vocab_version_id(db)
    candidates = _candidate_pool(db, profile)
    if len(candidates) < _CHECK_COUNT:
        checks = checks_for_coverage_words(m.coverage_words, random.Random(m.seed))
    else:
        scored = _score_candidates(db, profile, candidates, checkpoint_path=ckpt, vocab_version_id=vid)
        words = _diversify_pick(scored, _CHECK_COUNT)
        checks = [{"id": f"check_{i + 1:02d}", "word": words[i]} for i in range(len(words))]

    profile.checks_json = json.dumps(checks)
    existing_keys = {c.check_key for c in profile.checks}
    for spec in checks:
        if spec["id"] not in existing_keys:
            db.add(
                LabEvaluationCheck(
                    id=str(uuid.uuid4()),
                    profile_id=profile.id,
                    check_key=spec["id"],
                    word=spec["word"],
                    status="not_started",
                )
            )
    db.flush()
    return checks
