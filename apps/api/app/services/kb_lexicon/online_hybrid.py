"""Random Word API base pool + Datamuse enrichment -> unified entries + import summaries."""

from __future__ import annotations

import random as random_mod
from dataclasses import dataclass, field
from typing import Any

from app.services.kb_lexicon.datamuse_enrich import default_enrichment_queries, words_from_datamuse_query, words_from_alphabet_sweep
from app.services.kb_lexicon.entries import LexiconWordEntry, entry_from_parts
from app.services.kb_lexicon.normalize import merge_entries_keep_first, normalize_token_for_kb
from app.services.kb_lexicon.random_word_api import RandomWordApiError, fetch_random_words


@dataclass
class OnlineHybridConfig:
    label: str = "online-random-datamuse-v1"
    random_rounds: int = 3
    random_per_round: int = 100
    length_buckets: list[int | None] = field(default_factory=lambda: [None, 4, 7])
    datamuse_queries: list[dict[str, Any]] | None = None
    datamuse_max_per_query: int = 200
    # Mode C (optional): prefix wildcard queries from a sample of random-base seeds
    seed_enrichment_count: int = 0
    seed_enrichment_max_per_seed: int = 40
    # When > 0: use Datamuse alphabet sweep as primary source, cap at this count
    target_words: int = 0


def build_online_hybrid_entries(cfg: OnlineHybridConfig) -> tuple[list[LexiconWordEntry], dict[str, Any], dict[str, Any]]:
    """
    Pull random words, normalize, Datamuse enrich, merge.
    Returns (entries, import_config, import_summary).
    """
    queries = cfg.datamuse_queries if cfg.datamuse_queries is not None else default_enrichment_queries(cfg.datamuse_max_per_query)

    import_config: dict[str, Any] = {
        "random_pull_rounds": cfg.random_rounds,
        "random_pull_size": cfg.random_per_round,
        "length_buckets": cfg.length_buckets,
        "datamuse_enrichment_rules": queries,
        "datamuse_max_per_query": cfg.datamuse_max_per_query,
        "seed_enrichment": {
            "enabled": cfg.seed_enrichment_count > 0,
            "seed_sample_size": cfg.seed_enrichment_count,
            "max_per_seed": cfg.seed_enrichment_max_per_seed,
        },
        "normalization_rules": {"alphabet": "strict_lowercase_a_to_z"},
    }

    # Large-vocabulary mode: use Datamuse alphabet sweep (a* .. z*) as primary source
    if cfg.target_words > 500:
        sweep_words = words_from_alphabet_sweep(cfg.target_words)
        sweep_entries: list[LexiconWordEntry] = []
        for w in sweep_words:
            nw = normalize_token_for_kb(w)
            if nw:
                sweep_entries.append(
                    entry_from_parts(
                        normalized_word=nw,
                        raw_word=w,
                        entry_source_kind="datamuse",
                        entry_source_name="api.datamuse.com",
                        entry_source_metadata={"mode": "alphabet_sweep"},
                    )
                )
        merged = merge_entries_keep_first(sweep_entries)
        import_summary = {
            "mode": "alphabet_sweep",
            "sweep_collected": len(sweep_words),
            "merged_unique_count": len(merged),
            "target_words": cfg.target_words,
        }
        import_config["mode"] = "alphabet_sweep"
        import_config["target_words"] = cfg.target_words
        return merged, import_config, import_summary

    raw_random: list[tuple[str, int | None]] = []
    for _ in range(max(1, cfg.random_rounds)):
        for length in cfg.length_buckets:
            try:
                batch = fetch_random_words(number=cfg.random_per_round, length=length)
                raw_random.extend((w, length) for w in batch)
            except RandomWordApiError:
                continue

    random_entries: list[LexiconWordEntry] = []
    skipped_invalid_random = 0
    for w, length_bucket in raw_random:
        nw = normalize_token_for_kb(w)
        if not nw:
            skipped_invalid_random += 1
            continue
        random_entries.append(
            entry_from_parts(
                normalized_word=nw,
                raw_word=w,
                entry_source_kind="random_word_api",
                entry_source_name="random-word-api.herokuapp.com",
                entry_source_metadata={"length_bucket": length_bucket},
            )
        )

    dm_raw = 0
    dm_imported = 0
    dm_entries: list[LexiconWordEntry] = []
    for q in queries:
        sp = q.get("sp")
        lc = q.get("lc")
        rc = q.get("rc")
        mx = int(q.get("max_results", cfg.datamuse_max_per_query))
        words = words_from_datamuse_query(sp=sp, lc=lc, rc=rc, max_results=mx)
        dm_raw += len(words)
        for w in words:
            nw = normalize_token_for_kb(w)
            if not nw:
                continue
            dm_imported += 1
            dm_entries.append(
                entry_from_parts(
                    normalized_word=nw,
                    raw_word=w,
                    entry_source_kind="datamuse",
                    entry_source_name="api.datamuse.com",
                    entry_source_metadata={"sp": sp, "lc": lc, "rc": rc},
                )
            )

    seed_entries: list[LexiconWordEntry] = []
    seed_raw = 0
    seed_kept = 0
    if cfg.seed_enrichment_count > 0 and random_entries:
        pool = [e["normalized_word"] for e in random_entries]
        random_mod.shuffle(pool)
        picked = pool[: min(cfg.seed_enrichment_count, len(pool))]
        for seed in picked:
            prefix = seed[:3] if len(seed) >= 3 else seed
            if len(prefix) < 2:
                continue
            words = words_from_datamuse_query(sp=f"{prefix}*", max_results=cfg.seed_enrichment_max_per_seed)
            seed_raw += len(words)
            for w in words:
                nw = normalize_token_for_kb(w)
                if not nw:
                    continue
                seed_kept += 1
                seed_entries.append(
                    entry_from_parts(
                        normalized_word=nw,
                        raw_word=w,
                        entry_source_kind="datamuse",
                        entry_source_name="api.datamuse.com",
                        entry_source_metadata={"mode": "seed_driven", "seed": seed, "sp": f"{prefix}*"},
                    )
                )

    merged = merge_entries_keep_first(random_entries + dm_entries + seed_entries)
    merged_unique = len(merged)
    import_summary = {
        "random_raw_count": len(raw_random),
        "random_imported_count": len(random_entries),
        "datamuse_raw_count": dm_raw,
        "datamuse_imported_count": dm_imported,
        "datamuse_seed_raw_count": seed_raw,
        "datamuse_seed_imported_count": seed_kept,
        "merged_unique_count": merged_unique,
        "skipped_invalid_random": skipped_invalid_random,
        "skipped_duplicate_count": max(
            0, len(random_entries) + len(dm_entries) + len(seed_entries) - merged_unique
        ),
    }
    return merged, import_config, import_summary
