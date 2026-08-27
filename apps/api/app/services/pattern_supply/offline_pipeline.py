from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.config.pattern_supply import OFFLINE_POLICY
from app.services.pattern_supply.normalization import normalize_word

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'\-]{1,}")


@dataclass(frozen=True)
class OfflineCorpusStats:
    token_count: int
    unique_words: int
    word_counter: Counter[str]
    context_pairs: dict[str, Counter[str]]
    collocations: dict[str, Counter[str]]


def load_corpus_stats(corpus_path: str | None = None) -> OfflineCorpusStats:
    path = Path(corpus_path or OFFLINE_POLICY.corpus_path)
    if not path.exists():
        raise FileNotFoundError(f"offline corpus not found: {path}")

    word_counter: Counter[str] = Counter()
    context_pairs: dict[str, Counter[str]] = defaultdict(Counter)
    collocations: dict[str, Counter[str]] = defaultdict(Counter)
    token_count = 0

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            raw_tokens = _TOKEN_RE.findall(line)
            tokens: list[str] = []
            for t in raw_tokens:
                w = normalize_word(t)
                if len(w) < OFFLINE_POLICY.min_word_len:
                    continue
                tokens.append(w)
                word_counter[w] += 1
                token_count += 1
            for idx, center in enumerate(tokens):
                left = tokens[idx - 1] if idx > 0 else ""
                right = tokens[idx + 1] if idx + 1 < len(tokens) else ""
                if left:
                    context_pairs[f"left:{left}"][center] += 1
                if right:
                    context_pairs[f"right:{right}"][center] += 1
                if left and right:
                    context_pairs[f"lr:{left}_{right}"][center] += 1
                if right:
                    collocations[f"colloc:{center}_{right}"][center] += 1
                    collocations[f"colloc:{center}_{right}"][right] += 1

    max_vocab = OFFLINE_POLICY.max_vocab_size
    if len(word_counter) > max_vocab:
        keep = set(w for w, _ in word_counter.most_common(max_vocab))
        word_counter = Counter({w: c for w, c in word_counter.items() if w in keep})
        for source in (context_pairs, collocations):
            for k, ctr in list(source.items()):
                source[k] = Counter({w: c for w, c in ctr.items() if w in keep})
                if not source[k]:
                    source.pop(k, None)

    return OfflineCorpusStats(
        token_count=token_count,
        unique_words=len(word_counter),
        word_counter=word_counter,
        context_pairs=dict(context_pairs),
        collocations=dict(collocations),
    )

