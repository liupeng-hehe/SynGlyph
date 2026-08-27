"""
Bootstrap import pipeline: fetch word frequency list, clean, compute features,
greedy coverage selection, create stimuli.
"""
import csv
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from io import StringIO
from urllib.request import urlopen

logger = logging.getLogger(__name__)

WORD_FREQ_URL = "https://raw.githubusercontent.com/filiph/english_words/master/data/word-freq-top5000.csv"

# Fallback: top ~200 most common English words (if fetch fails)
FALLBACK_WORDS = [
    "the", "be", "and", "of", "a", "in", "to", "have", "it", "to", "for", "not", "on", "with",
    "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say",
    "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make",
    "can", "like", "time", "no", "just", "him", "know", "take", "people", "into", "year",
    "your", "good", "some", "could", "them", "see", "other", "than", "then", "now", "look",
    "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how",
    "our", "work", "first", "well", "way", "even", "new", "want", "because", "any", "these",
    "give", "day", "most", "us", "before", "between", "both", "each", "few", "more", "own",
    "same", "such", "through", "very", "where", "while", "after", "again", "being", "does",
    "during", "here", "made", "many", "might", "must", "never", "often", "once", "should",
    "three", "under", "until", "without", "world", "down", "got", "last", "long", "part",
    "place", "right", "still", "thing", "though", "today", "too", "another", "around",
    "called", "different", "end", "example", "high", "important", "keep", "large", "left",
    "let", "live", "next", "number", "off", "old", "over", "really", "seem", "small",
    "tell", "turn", "always", "away", "become", "begin", "best", "bring", "change", "children",
    "close", "country", "course", "door", "enough", "ever", "find", "hand", "heard", "house",
    "kind", "know", "large", "learn", "life", "light", "line", "list", "little", "might",
    "money", "mother", "move", "name", "night", "open", "order", "point", "problem", "question",
    "run", "school", "show", "start", "state", "story", "student", "study", "system", "that",
]


@dataclass
class WordFeatures:
    word: str
    frequency_rank: int
    contextual_diversity: float | None  # dispersion if available
    length: int
    char_coverage_score: float = 0.0
    bigram_coverage_score: float = 0.0
    trigram_coverage_score: float = 0.0
    prefix_patterns: str | None = None  # JSON
    suffix_patterns: str | None = None  # JSON
    pronunciation_available: bool = False


def _fetch_word_list() -> list[tuple[int, str, float | None]]:
    """Fetch word frequency list. Returns [(rank, word, dispersion?), ...]."""
    try:
        with urlopen(WORD_FREQ_URL, timeout=10) as resp:
            content = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning("Failed to fetch word list: %s. Using fallback.", e)
        return [(i + 1, w, None) for i, w in enumerate(FALLBACK_WORDS)]

    rows = []
    reader = csv.reader(StringIO(content))
    header = next(reader, None)
    if header and header[0] == "Rank":
        pass  # skip header
    for row in reader:
        if len(row) < 2:
            continue
        try:
            rank = int(row[0])
        except ValueError:
            continue
        word = row[1].strip().lower()
        dispersion = float(row[4]) if len(row) > 4 else None
        rows.append((rank, word, dispersion))
    return rows[:8000]


def _clean_word(w: str) -> str | None:
    if not w or len(w) < 2 or len(w) > 15:
        return None
    if not re.match(r"^[a-z]+$", w):
        return None
    return w


def _compute_features(
    words: list[tuple[int, str, float | None]],
) -> list[WordFeatures]:
    result = []
    for rank, word, dispersion in words:
        clean = _clean_word(word)
        if not clean:
            continue
        length = len(clean)
        chars = set(clean)
        bigrams = {clean[i : i + 2] for i in range(len(clean) - 1)}
        trigrams = {clean[i : i + 3] for i in range(len(clean) - 2)}
        char_cov = len(chars) / 26.0
        bigram_cov = len(bigrams) / max(1, length - 1)
        trigram_cov = len(trigrams) / max(1, length - 2) if length >= 3 else 0.0
        prefix = json.dumps([clean[:2], clean[:3]] if len(clean) >= 3 else [clean[:2]])
        suffix = json.dumps([clean[-2:], clean[-3:]] if len(clean) >= 3 else [clean[-2:]])
        result.append(
            WordFeatures(
                word=clean,
                frequency_rank=rank,
                contextual_diversity=dispersion,
                length=length,
                char_coverage_score=char_cov,
                bigram_coverage_score=bigram_cov,
                trigram_coverage_score=trigram_cov,
                prefix_patterns=prefix,
                suffix_patterns=suffix,
                pronunciation_available=False,
            )
        )
    return result


def _greedy_coverage_selection(
    features: list[WordFeatures],
    target_count: int = 150,
) -> list[WordFeatures]:
    selected: list[WordFeatures] = []
    covered_chars: set[str] = set()
    covered_bigrams: set[str] = set()
    covered_trigrams: set[str] = set()

    remaining = list(features)
    while len(selected) < target_count and remaining:
        best = None
        best_gain = -1.0
        best_idx = -1
        for i, f in enumerate(remaining):
            new_chars = set(f.word) - covered_chars
            new_bigrams = {f.word[j : j + 2] for j in range(len(f.word) - 1)} - covered_bigrams
            new_trigrams = {f.word[j : j + 3] for j in range(len(f.word) - 2)} - covered_trigrams
            gain = (
                len(new_chars) * 1.0
                + len(new_bigrams) * 0.5
                + len(new_trigrams) * 0.3
                + (1.0 / (f.frequency_rank + 1)) * 0.2
            )
            if gain > best_gain:
                best_gain = gain
                best = f
                best_idx = i
        if best is None or best_gain <= 0:
            break
        selected.append(best)
        covered_chars.update(best.word)
        for j in range(len(best.word) - 1):
            covered_bigrams.add(best.word[j : j + 2])
        for j in range(len(best.word) - 2):
            covered_trigrams.add(best.word[j : j + 3])
        remaining.pop(best_idx)
    return selected


def run_bootstrap_import(db) -> dict:
    """
    Run the full bootstrap import pipeline. Returns dict with created, skipped, etc.
    """
    raw = _fetch_word_list()
    features = _compute_features(raw)
    selected = _greedy_coverage_selection(features, target_count=150)

    from app.models import Stimulus

    existing_lower = {r[0].lower() for r in db.query(Stimulus.text).all()}
    created = 0
    for f in selected:
        if f.word.lower() in existing_lower:
            continue
        stim = Stimulus(
            id=str(uuid.uuid4()),
            text=f.word,
            language="en",
            source_type="seed_coverage",
            frequency_rank=f.frequency_rank,
            contextual_diversity=f.contextual_diversity,
            char_coverage_score=f.char_coverage_score,
            bigram_coverage_score=f.bigram_coverage_score,
            trigram_coverage_score=f.trigram_coverage_score,
            prefix_patterns=f.prefix_patterns,
            suffix_patterns=f.suffix_patterns,
            pronunciation_available=f.pronunciation_available,
            selected_for_seed=True,
        )
        db.add(stim)
        existing_lower.add(f.word.lower())
        created += 1

    db.commit()
    return {
        "created": created,
        "skipped": len(selected) - created,
        "selected_count": len(selected),
        "pool_size": len(features),
    }
