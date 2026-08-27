"""Deterministic task manifest: 26 letters, coverage words (v1 flat / v2 anchor+assist), checks."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from typing import Any

# Pool must allow 30 draws + 10 check draws without overlap (we filter).
_COVERAGE_POOL: list[str] = [
    "shine", "water", "river", "ocean", "silver", "golden", "morning", "evening",
    "whisper", "thunder", "gentle", "bright", "shadow", "mirror", "crystal",
    "velvet", "paper", "canvas", "melody", "silence", "garden", "winter",
    "summer", "harbor", "voyage", "compass", "lantern", "meadow", "falcon",
    "ember", "cascade", "horizon", "marble", "orchid", "quartz", "nebula",
    "prism", "sonnet", "ripple", "azure", "crimson", "violet", "amber",
    "indigo", "saffron", "verdant", "opal", "lumen", "driftwood", "starlight",
]

_CHECK_POOL: list[str] = [
    "bluebird", "moonrise", "daybreak", "northwind", "seastone", "firefly",
    "snowfield", "goldleaf", "ironwood", "mistral",
]

ANCHOR_COUNT = 10
ASSIST_COUNT = 20
COVERAGE_COUNT = ANCHOR_COUNT + ASSIST_COUNT


@dataclass(frozen=True)
class LabManifest:
    manifest_version: int
    seed: int
    letters_order: list[str]
    coverage_anchor_words: list[str]
    coverage_assist_words: list[str]
    coverage_words: list[str]
    checks: list[dict[str, str]]  # {"id": "check_01", "word": "..."}

    def letters_order_json(self) -> str:
        return json.dumps(self.letters_order)

    def coverage_words_json(self) -> str:
        return json.dumps(self.coverage_words)

    def coverage_anchor_words_json(self) -> str:
        return json.dumps(self.coverage_anchor_words)

    def coverage_assist_words_json(self) -> str:
        return json.dumps(self.coverage_assist_words)

    def checks_json(self) -> str:
        return json.dumps(self.checks)

    def is_v2(self) -> bool:
        return self.manifest_version >= 2

    def coverage_tier_for_word(self, word: str) -> str:
        wl = word.lower()
        if wl in {w.lower() for w in self.coverage_anchor_words}:
            return "anchor"
        if wl in {w.lower() for w in self.coverage_assist_words}:
            return "assist"
        for i, w in enumerate(self.coverage_words):
            if w.lower() != wl:
                continue
            if i < ANCHOR_COUNT:
                return "anchor"
            if i < COVERAGE_COUNT:
                return "assist"
            break
        return "legacy"


def checks_for_coverage_words(coverage_words: list[str], rng: random.Random) -> list[dict[str, str]]:
    """Ten evaluation words disjoint from ``coverage_words`` (same pools as :func:`build_manifest`)."""
    cov_l = {w.lower() for w in coverage_words}
    combined: list[str] = list(dict.fromkeys([*_COVERAGE_POOL, *_CHECK_POOL]))
    rng.shuffle(combined)
    tail = [w for w in combined if w.lower() not in cov_l]
    if len(tail) < 10:
        for w in _CHECK_POOL + _COVERAGE_POOL:
            if w.lower() not in cov_l and w not in tail:
                tail.append(w)
            if len(tail) >= 10:
                break
    check_words = tail[:10]
    return [{"id": f"check_{i + 1:02d}", "word": check_words[i]} for i in range(len(check_words))]


def _shuffle_letters(rng: random.Random) -> list[str]:
    letters = [chr(ord("a") + i) for i in range(26)]
    rng.shuffle(letters)
    return letters


def _static_coverage_split(rng: random.Random) -> tuple[list[str], list[str], list[str]]:
    combined: list[str] = list(dict.fromkeys([*_COVERAGE_POOL, *_CHECK_POOL]))
    rng.shuffle(combined)
    if len(combined) < COVERAGE_COUNT:
        raise RuntimeError("lab_manifest: combined word pool must have at least 30 unique entries")
    coverage = combined[:COVERAGE_COUNT]
    return coverage[:ANCHOR_COUNT], coverage[ANCHOR_COUNT:COVERAGE_COUNT], coverage


def build_manifest(*, seed: int | None = None, manifest_version: int = 1) -> LabManifest:
    """Seed-driven shuffle: v1 flat 30 coverage + 10 checks."""
    s = seed if seed is not None else random.randint(1, 2_147_483_647)
    rng = random.Random(s)
    letters = _shuffle_letters(rng)
    combined: list[str] = list(dict.fromkeys([*_COVERAGE_POOL, *_CHECK_POOL]))
    rng.shuffle(combined)
    if len(combined) < 40:
        raise RuntimeError("lab_manifest: combined word pool must have at least 40 unique entries")
    coverage = combined[:30]
    tail = [w for w in combined[30:] if w not in coverage]
    check_words = tail[:10]
    checks = [{"id": f"check_{i + 1:02d}", "word": check_words[i]} for i in range(10)]
    return LabManifest(
        manifest_version=manifest_version,
        seed=s,
        letters_order=letters,
        coverage_anchor_words=[],
        coverage_assist_words=[],
        coverage_words=coverage,
        checks=checks,
    )


def build_manifest_v2(*, seed: int | None = None) -> LabManifest:
    """v2: 10 anchor + 20 assist coverage words; checks filled later via AL."""
    s = seed if seed is not None else random.randint(1, 2_147_483_647)
    rng = random.Random(s)
    letters = _shuffle_letters(rng)
    anchor, assist, coverage = _static_coverage_split(rng)
    return LabManifest(
        manifest_version=2,
        seed=s,
        letters_order=letters,
        coverage_anchor_words=anchor,
        coverage_assist_words=assist,
        coverage_words=coverage,
        checks=[],
    )


def merge_kb_coverage_v2(
    anchor_words: list[str],
    assist_words: list[str],
    *,
    seed: int,
    static_fallback: LabManifest,
) -> tuple[list[str], list[str], list[str]]:
    """Ensure 10 anchor + 20 assist words; backfill from static manifest when KB is short."""
    seen: set[str] = set()
    anchor: list[str] = []
    for w in anchor_words:
        wl = w.lower()
        if wl not in seen:
            seen.add(wl)
            anchor.append(w)
        if len(anchor) >= ANCHOR_COUNT:
            break
    for w in static_fallback.coverage_anchor_words or static_fallback.coverage_words[:ANCHOR_COUNT]:
        if len(anchor) >= ANCHOR_COUNT:
            break
        if w.lower() not in seen:
            seen.add(w.lower())
            anchor.append(w)

    assist: list[str] = []
    for w in assist_words:
        wl = w.lower()
        if wl not in seen:
            seen.add(wl)
            assist.append(w)
        if len(assist) >= ASSIST_COUNT:
            break
    pool_tail = static_fallback.coverage_assist_words or static_fallback.coverage_words[ANCHOR_COUNT:]
    for w in pool_tail:
        if len(assist) >= ASSIST_COUNT:
            break
        if w.lower() not in seen:
            seen.add(w.lower())
            assist.append(w)
    for w in _COVERAGE_POOL + _CHECK_POOL:
        if len(assist) >= ASSIST_COUNT:
            break
        if w.lower() not in seen:
            seen.add(w.lower())
            assist.append(w)

    coverage = anchor[:ANCHOR_COUNT] + assist[:ASSIST_COUNT]
    return anchor[:ANCHOR_COUNT], assist[:ASSIST_COUNT], coverage


def parse_manifest(profile: Any) -> LabManifest:
    letters = json.loads(profile.letters_order_json)
    coverage_words = json.loads(profile.coverage_words_json)
    checks = json.loads(profile.checks_json)
    manifest_version = int(profile.manifest_version)
    anchor_raw = getattr(profile, "coverage_anchor_words_json", None)
    assist_raw = getattr(profile, "coverage_assist_words_json", None)
    if anchor_raw and assist_raw:
        anchor = json.loads(anchor_raw)
        assist = json.loads(assist_raw)
    elif manifest_version >= 2:
        anchor = coverage_words[:ANCHOR_COUNT]
        assist = coverage_words[ANCHOR_COUNT:COVERAGE_COUNT]
    else:
        anchor = []
        assist = []
    return LabManifest(
        manifest_version=manifest_version,
        seed=int(profile.seed),
        letters_order=letters,
        coverage_anchor_words=anchor,
        coverage_assist_words=assist,
        coverage_words=coverage_words,
        checks=checks,
    )
