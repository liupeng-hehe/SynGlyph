"""Greedy pattern-cover word selection (same logic as GET .../words/top-by-pattern-count)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import KbPattern, KbWord
from app.models import KbWordPattern as KbWP


def collapse_ngrams(texts: list[str], eligible: set[str]) -> list[str]:
    """
    Collapse redundant n-grams: if 2+ n-grams share an (n-1)-gram prefix/suffix
    AND that shorter gram is in the eligible set, replace them with the shorter one.
    Repeats until stable. Returns sorted longest-first.
    """
    working: set[str] = set(texts)
    changed = True
    while changed:
        changed = False
        by_len: dict[int, list[str]] = {}
        for g in working:
            by_len.setdefault(len(g), []).append(g)
        for n in sorted(by_len.keys(), reverse=True):
            if n < 3:
                continue
            by_prefix: dict[str, list[str]] = {}
            by_suffix: dict[str, list[str]] = {}
            for g in by_len[n]:
                by_prefix.setdefault(g[: n - 1], []).append(g)
                by_suffix.setdefault(g[1:], []).append(g)
            for root, group in {**by_prefix, **by_suffix}.items():
                if len(group) >= 2 and root in eligible:
                    for g in group:
                        working.discard(g)
                    working.add(root)
                    changed = True
    return sorted(working, key=len, reverse=True)


def top_words_by_pattern_count_data(
    db: Session,
    vocab_version_id: str,
    *,
    limit: int = 30,
    min_freq: int = 20,
    max_word_len: int = 15,
) -> dict[str, Any]:
    """
    Return the same payload shape as the KB explorer route (no HTTP).
    ``vocab_version_id`` must exist and be the intended KB version.
    """
    eligible_rows = (
        db.query(KbPattern.id, KbPattern.pattern_key, KbPattern.corpus_freq)
        .filter(
            KbPattern.vocab_version_id == vocab_version_id,
            KbPattern.corpus_freq >= min_freq,
            KbPattern.unit_type != "char",
        )
        .all()
    )
    eligible_ids: set[str] = {r[0] for r in eligible_rows}
    eligible_text: dict[str, str] = {
        r[0]: (r[1].split(":", 1)[1] if ":" in r[1] else r[1])
        for r in eligible_rows
    }
    eligible_freq: dict[str, int] = {r[0]: r[2] for r in eligible_rows}
    eligible_text_set: set[str] = set(eligible_text.values())
    total_weight: int = sum(eligible_freq.values())
    if not eligible_ids:
        return {"min_freq": min_freq, "total_eligible_patterns": 0, "total_weight": 0, "covered_weight": 0, "items": []}

    word_text: dict[str, str] = {
        r[0]: r[1]
        for r in db.query(KbWord.id, KbWord.normalized_word)
        .filter(KbWord.vocab_version_id == vocab_version_id)
        .all()
        if len(r[1]) <= max_word_len
    }

    valid_word_ids = set(word_text.keys())
    word_patterns: dict[str, set[str]] = {}
    for kb_word_id, pattern_id in (
        db.query(KbWP.kb_word_id, KbWP.pattern_id)
        .filter(KbWP.vocab_version_id == vocab_version_id, KbWP.pattern_id.in_(eligible_ids))
        .all()
    ):
        if kb_word_id in valid_word_ids:
            word_patterns.setdefault(kb_word_id, set()).add(pattern_id)

    uncovered = set(eligible_ids)
    remaining = {wid: pats.copy() for wid, pats in word_patterns.items()}
    result: list[dict[str, Any]] = []

    for _ in range(limit):
        if not uncovered or not remaining:
            break
        best_id = max(remaining, key=lambda wid: len(remaining[wid] & uncovered))
        new_covered = remaining[best_id] & uncovered
        if not new_covered:
            break
        new_pid_list = sorted(new_covered, key=lambda pid: -eligible_freq.get(pid, 0))
        raw_texts = [eligible_text[pid] for pid in new_pid_list if pid in eligible_text]
        collapsed_texts = collapse_ngrams(raw_texts, eligible_text_set)
        text_to_freq: dict[str, int] = {
            eligible_text[pid]: eligible_freq.get(pid, 0)
            for pid in new_pid_list if pid in eligible_text
        }
        pattern_freqs = [text_to_freq.get(t, 0) for t in collapsed_texts]
        new_weight = sum(eligible_freq.get(pid, 0) for pid in new_covered)
        result.append({
            "word": word_text.get(best_id, best_id),
            "new_patterns": len(new_covered),
            "new_weight": new_weight,
            "total_patterns": len(remaining[best_id]),
            "pattern_strings": collapsed_texts,
            "pattern_freqs": pattern_freqs,
        })
        uncovered -= new_covered
        del remaining[best_id]

    covered_weight = sum(item["new_weight"] for item in result)
    return {
        "min_freq": min_freq,
        "total_eligible_patterns": len(eligible_ids),
        "total_weight": total_weight,
        "covered_weight": covered_weight,
        "items": result,
    }
