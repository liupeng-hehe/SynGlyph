#!/usr/bin/env python3
"""CLI: rebuild KB (Orthographic Prior) from stimuli, lexicon file/text, wordfreq, cached API JSON, or online hybrid."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))

from app.db import SessionLocal  # noqa: E402
from app.services.kb_analytics.rebuild import rebuild_kb_from_stimuli  # noqa: E402
from app.services.kb_lexicon.ingest import (  # noqa: E402
    ingest_api_cached,
    ingest_builtin_wordfreq,
    ingest_lexicon_path,
    ingest_lexicon_text,
    ingest_online_hybrid,
)
from app.services.kb_lexicon.online_hybrid import OnlineHybridConfig  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--label", default="cli_rebuild", help="KB version label")
    p.add_argument("--no-activate", action="store_true", help="Do not set is_active on this version")

    src = p.add_mutually_exclusive_group()
    src.add_argument("--stimuli", action="store_true", help="Rebuild from English Stimulus rows (default)")
    src.add_argument("--lexicon-file", type=Path, default=None, help="Local .txt/.csv/.json lexicon path")
    src.add_argument("--lexicon-text-file", type=Path, default=None, help="Plain text file (one word per line)")
    src.add_argument("--lexicon-text", type=str, default=None, help="Inline newline-separated words")
    src.add_argument("--builtin-wordfreq", action="store_true", help="Use wordfreq top-N English list")
    src.add_argument("--api-cached-file", type=Path, default=None, help="JSON file from a prior API dump")
    src.add_argument("--online-hybrid", action="store_true", help="Random Word API + Datamuse (network)")

    p.add_argument("--max-words", type=int, default=300, help="With --stimuli: cap stimuli rows (ignored with --no-stimuli-limit)")
    p.add_argument(
        "--no-stimuli-limit",
        action="store_true",
        help="With --stimuli: include all English stimuli (after ordering), no limit",
    )
    p.add_argument("--dataset-id", default=None, help="With --stimuli: filter by dataset id")
    p.add_argument("--builtin-limit", type=int, default=5000, help="With --builtin-wordfreq: N words")

    p.add_argument("--random-rounds", type=int, default=3, help="With --online-hybrid")
    p.add_argument("--random-per-round", type=int, default=50, help="With --online-hybrid")
    p.add_argument("--seed-enrichment", type=int, default=0, help="With --online-hybrid: seeds for prefix * queries")

    args = p.parse_args()

    if not any(
        (
            args.stimuli,
            args.lexicon_file,
            args.lexicon_text_file,
            args.lexicon_text,
            args.builtin_wordfreq,
            args.api_cached_file,
            args.online_hybrid,
        )
    ):
        args.stimuli = True

    db = SessionLocal()
    try:
        set_active = not args.no_activate
        if args.stimuli:
            max_words = None if args.no_stimuli_limit else args.max_words
            vid = rebuild_kb_from_stimuli(
                db,
                label=args.label,
                max_words=max_words,
                dataset_id=args.dataset_id,
                source="scripts/rebuild_kb_vocab.py",
                set_active=set_active,
            )
            print(vid)
            return
        if args.lexicon_file:
            vid, _ = ingest_lexicon_path(db, path=args.lexicon_file, label=args.label, set_active=set_active)
            print(vid)
            return
        if args.lexicon_text_file:
            text = args.lexicon_text_file.read_text(encoding="utf-8")
            vid, _ = ingest_lexicon_text(db, text=text, label=args.label, set_active=set_active)
            print(vid)
            return
        if args.lexicon_text is not None:
            vid, _ = ingest_lexicon_text(db, text=args.lexicon_text, label=args.label, set_active=set_active)
            print(vid)
            return
        if args.builtin_wordfreq:
            vid, _ = ingest_builtin_wordfreq(
                db, label=args.label, limit=args.builtin_limit, set_active=set_active
            )
            print(vid)
            return
        if args.api_cached_file:
            vid, _ = ingest_api_cached(db, path=args.api_cached_file, label=args.label, set_active=set_active)
            print(vid)
            return
        if args.online_hybrid:
            cfg = OnlineHybridConfig(
                label=args.label,
                random_rounds=args.random_rounds,
                random_per_round=args.random_per_round,
                seed_enrichment_count=args.seed_enrichment,
            )
            vid, _ = ingest_online_hybrid(db, cfg=cfg, set_active=set_active)
            print(vid)
            return
    finally:
        db.close()


if __name__ == "__main__":
    main()
