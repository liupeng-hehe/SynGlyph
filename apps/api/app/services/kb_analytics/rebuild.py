"""Build or refresh KB tables from English stimuli + optional English product segments."""

from __future__ import annotations

import io
import json
import logging
import tempfile
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

from sqlalchemy.orm import Session

from app.config.active_learning import pattern_target_for_unit_type
from app.models import Annotation, KbLetterNeighbor, KbPattern, KbPatternPosition, KbSegmentInstance
from app.models import KbSegmentLabel, KbSegmentParam, KbVocabVersion, KbWord, KbWordPattern
from app.models import Stimulus
from app.models import AnalyticsGapSnapshot, AnalyticsPatternLabeled, AnalyticsSegmentComboLabeled
from app.models.english import EnglishSegment, EnglishWordInstance
from app.services.kb_analytics.text_units import (
    all_pattern_keys_for_text,
    char_units,
    count_in_word_for_pattern,
    flatten_pattern_keys,
    positions_json_for_pattern,
)
from app.services.pattern_supply.normalization import normalize_word


def _dedupe_stimuli_by_normalized_word(stimuli: list[Stimulus]) -> list[Stimulus]:
    """
    One KbWord row per (vocab_version, normalized_word). Stimulus list may contain duplicate
    spellings that normalize to the same key; keep the best-ranked row per key.

    ``stimuli`` should already be ordered like the KB query (rank asc nullslast, then created_at desc).
    """
    if not stimuli:
        return []

    def rank_value(st: Stimulus) -> float:
        r = st.frequency_rank
        return float("inf") if r is None else float(r)

    best: dict[str, Stimulus] = {}
    for st in stimuli:
        raw = st.text or ""
        nw = normalize_word(raw)
        if not nw:
            continue
        prev = best.get(nw)
        if prev is None:
            best[nw] = st
            continue
        if rank_value(st) < rank_value(prev):
            best[nw] = st
        # Equal rank: keep ``prev`` (earlier in query order wins among ties).
    return sorted(best.values(), key=lambda s: normalize_word(s.text or ""))


def _deactivate_all_versions(db: Session) -> None:
    for v in db.query(KbVocabVersion).all():
        v.is_active = False


def _english_latest_by_normalized(db: Session) -> dict[str, EnglishWordInstance]:
    rows = db.query(EnglishWordInstance).all()
    by_norm: dict[str, list[EnglishWordInstance]] = defaultdict(list)
    for wi in rows:
        n = normalize_word(wi.word_text or "")
        if n:
            by_norm[n].append(wi)

    out: dict[str, EnglishWordInstance] = {}
    for n, lst in by_norm.items():
        out[n] = max(lst, key=lambda x: (x.updated_at or x.created_at or datetime.min.replace(tzinfo=timezone.utc)))
    return out


def _collapse_redundant_ngrams(
    freq: Counter[tuple[str, str]],
    threshold: int = 3,
) -> Counter[tuple[str, str]]:
    """
    For n-grams of length n (n >= 3), group by shared (n-1)-gram prefix AND suffix separately.
    If >= threshold n-grams share the same (n-1)-gram root AND that root exists in freq,
    remove those n-grams — the shorter root already represents the pattern.
    Iterates from highest n downward until stable.
    """
    result: Counter[tuple[str, str]] = Counter(freq)

    def _clean(pk: str) -> str:
        return pk.split(":", 1)[1] if ":" in pk else pk

    for n in range(5, 2, -1):
        ut_n = f"ngram_{n}"
        ut_short = f"ngram_{n - 1}"
        # Collect all n-grams of this length
        ngrams_n = [(pk, _clean(pk)) for (ut, pk) in result if ut == ut_n]
        if not ngrams_n:
            continue

        to_remove: set[tuple[str, str]] = set()

        # Group by prefix (first n-1 chars) and suffix (last n-1 chars)
        by_prefix: dict[str, list[str]] = {}
        by_suffix: dict[str, list[str]] = {}
        for pk, text in ngrams_n:
            by_prefix.setdefault(text[:-1], []).append(pk)
            by_suffix.setdefault(text[1:], []).append(pk)

        for root, group in list(by_prefix.items()) + list(by_suffix.items()):
            if len(group) < threshold:
                continue
            root_pk = f"ng{n - 1}:{root}"
            # Root must already exist as a shorter pattern in freq
            if (ut_short, root_pk) in result:
                for pk in group:
                    to_remove.add((ut_n, pk))

        for key in to_remove:
            del result[key]

    return result


def _train_sp_vocab(words: list[str], vocab_size: int = 400) -> frozenset[str]:
    """
    Train a SentencePiece unigram model on *words* and return the learned
    subword pieces (2-4 alpha chars only) as a frozenset.

    Returns an empty frozenset if sentencepiece is not installed or training fails.
    """
    try:
        import sentencepiece as spm  # type: ignore
    except ImportError:
        logger.debug("sentencepiece not installed — skipping SP vocab")
        return frozenset()

    try:
        corpus_text = "\n".join(words)
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(corpus_text)
            corpus_path = f.name

        import os
        with tempfile.TemporaryDirectory() as tmpdir:
            model_prefix = os.path.join(tmpdir, "sp")
            spm.SentencePieceTrainer.train(
                input=corpus_path,
                model_prefix=model_prefix,
                vocab_size=min(vocab_size, max(50, len(words) // 2)),
                model_type="unigram",
                character_coverage=1.0,
                pad_id=0,
                unk_id=1,
                bos_id=-1,
                eos_id=-1,
            )
            sp = spm.SentencePieceProcessor()
            sp.load(model_prefix + ".model")
            pieces: frozenset[str] = frozenset(
                sp.id_to_piece(i)
                for i in range(sp.get_piece_size())
                if 2 <= len(sp.id_to_piece(i)) <= 4
                and sp.id_to_piece(i).isalpha()
            )
        os.unlink(corpus_path)
        logger.info("SP vocab trained: %d pieces from %d words", len(pieces), len(words))
        return pieces
    except Exception as exc:
        logger.warning("SP training failed: %s", exc)
        return frozenset()


def _populate_kb_tables_after_words(
    db: Session,
    vid: str,
    word_rows: list[tuple[KbWord, str]],
    english_by_norm: dict[str, EnglishWordInstance],
) -> None:
    """Pattern / neighbor / position tables, optional English segments, analytics."""
    # Train SentencePiece on the word list so the segmenter can use learned subwords
    raw_words = [raw for _, raw in word_rows]
    sp_vocab = _train_sp_vocab(raw_words)

    pattern_ids: dict[tuple[str, str], str] = {}
    corpus_pattern_freq: Counter[tuple[str, str]] = Counter()

    for kw, raw in word_rows:
        keys_by = all_pattern_keys_for_text(raw, sp_vocab=sp_vocab)
        for ut, keys in keys_by.items():
            for pk in keys:
                corpus_pattern_freq[(ut, pk)] += count_in_word_for_pattern(raw, ut, pk)

    for (ut, pk), freq in corpus_pattern_freq.items():
        pid = str(uuid.uuid4())
        pattern_ids[(ut, pk)] = pid
        db.add(
            KbPattern(
                id=pid,
                vocab_version_id=vid,
                unit_type=ut,
                pattern_key=pk,
                corpus_freq=int(freq),
            )
        )
    db.flush()

    neighbor_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    position_counts: dict[tuple[str, int], int] = defaultdict(int)

    for kw, raw in word_rows:
        ch = char_units(raw)
        keys_by = all_pattern_keys_for_text(raw, sp_vocab=sp_vocab)

        for ut, pks in keys_by.items():
            for pk in set(pks):
                pid = pattern_ids.get((ut, pk))
                if not pid:
                    continue
                pos_json = positions_json_for_pattern(raw, ut, pk)
                cnt = len(json.loads(pos_json)) if pos_json else 0
                if cnt == 0:
                    cnt = 1
                wp = KbWordPattern(
                    id=str(uuid.uuid4()),
                    vocab_version_id=vid,
                    kb_word_id=kw.id,
                    pattern_id=pid,
                    positions_json=pos_json,
                    count_in_word=cnt,
                )
                db.add(wp)
                for idx in json.loads(pos_json):
                    position_counts[(pid, int(idx))] += 1

        for i, c in enumerate(ch):
            if len(c) != 1:
                continue
            center = c
            if i > 0:
                left = ch[i - 1]
                neighbor_counts[(center, "left", left)] += 1
            if i + 1 < len(ch):
                right = ch[i + 1]
                neighbor_counts[(center, "right", right)] += 1

    for (center, side, neigh), cnt in neighbor_counts.items():
        db.add(
            KbLetterNeighbor(
                id=str(uuid.uuid4()),
                vocab_version_id=vid,
                center_letter=center,
                side=side,
                neighbor_char=neigh,
                count=int(cnt),
                pmi=None,
            )
        )

    for (pid, char_index), cnt in position_counts.items():
        db.add(
            KbPatternPosition(
                id=str(uuid.uuid4()),
                vocab_version_id=vid,
                pattern_id=pid,
                char_index=int(char_index),
                count=int(cnt),
            )
        )

    for kw, raw in word_rows:
        wi = english_by_norm.get(kw.normalized_word)
        if not wi:
            continue
        segs = (
            db.query(EnglishSegment)
            .filter(EnglishSegment.word_instance_id == wi.id)
            .order_by(EnglishSegment.sort_order)
            .all()
        )
        for s in segs:
            si = KbSegmentInstance(
                id=str(uuid.uuid4()),
                vocab_version_id=vid,
                kb_word_id=kw.id,
                span_start=0,
                span_end=max(0, len(char_units(raw)) - 1),
                span_order=s.sort_order,
                text_span=None,
                source="gold",
                model_snapshot_id=None,
                confidence_json=None,
            )
            db.add(si)
            db.flush()
            if s.label:
                db.add(
                    KbSegmentLabel(
                        id=str(uuid.uuid4()),
                        segment_instance_id=si.id,
                        label_key="english_label",
                        label_value=s.label,
                    )
                )
            db.add(
                KbSegmentParam(
                    id=str(uuid.uuid4()),
                    segment_instance_id=si.id,
                    param_key="color_json",
                    param_value_float=None,
                    param_json=s.color_json or "{}",
                )
            )

    db.flush()
    _rebuild_analytics(db, vid, pattern_ids)


def rebuild_kb_from_lexicon_entries(
    db: Session,
    *,
    entries: list[dict[str, Any]],
    label: str,
    source_kind: str,
    source_name: str | None = None,
    source_ref: str | None = None,
    import_config: dict[str, Any] | None = None,
    import_summary: dict[str, Any] | None = None,
    pipeline_source: str = "rebuild_kb_from_lexicon_entries",
    set_active: bool = True,
    copy_english_segments: bool = False,
) -> str:
    """
    Orthographic Prior KB core: build one KbVocabVersion snapshot from normalized word entries,
    then pattern / neighbor / position tables and analytics.

    ``entries`` items: ``normalized_word``, ``raw_word`` (optional), ``rank``, ``stimulus_id`` (optional).
    """
    _deactivate_all_versions(db)

    vid = str(uuid.uuid4())
    version = KbVocabVersion(
        id=vid,
        label=label,
        source=pipeline_source,
        word_count=0,
        is_active=set_active,
        stats_json=None,
        source_kind=source_kind,
        source_name=source_name,
        source_ref=source_ref,
        import_config_json=json.dumps(import_config) if import_config else None,
        import_summary_json=json.dumps(import_summary) if import_summary else None,
    )
    db.add(version)
    db.flush()

    english_by_norm = _english_latest_by_normalized(db) if copy_english_segments else {}

    word_rows: list[tuple[KbWord, str]] = []
    for ent in entries:
        nw = (ent.get("normalized_word") or "").strip()
        if not nw:
            continue
        raw = (ent.get("raw_word") or nw).strip() or nw
        kw = KbWord(
            id=str(uuid.uuid4()),
            vocab_version_id=vid,
            normalized_word=nw,
            raw_text=raw,
            stimulus_id=ent.get("stimulus_id"),
            rank=ent.get("rank"),
            length=len(char_units(raw)),
        )
        db.add(kw)
        word_rows.append((kw, raw))

    version.word_count = len(word_rows)
    db.flush()

    _populate_kb_tables_after_words(db, vid, word_rows, english_by_norm)
    db.commit()
    return vid


def rebuild_kb_from_stimuli(
    db: Session,
    *,
    label: str,
    max_words: int | None = 300,
    dataset_id: str | None = None,
    source: str | None = None,
    set_active: bool = True,
) -> str:
    """
    Optional adapter: English Stimulus rows -> lexicon entries -> same KB core as external datasets.

    ``max_words``: if ``None``, include all stimuli after ordering and dedupe (full selected list).
    If a positive integer, cap the query before dedupe (legacy default 300).
    """
    q = db.query(Stimulus).filter(Stimulus.language == "en")
    if dataset_id:
        q = q.filter(Stimulus.dataset_id == dataset_id)
    q = q.order_by(Stimulus.frequency_rank.asc().nullslast(), Stimulus.created_at.desc())
    if max_words is not None:
        q = q.limit(max_words)
    stimuli = _dedupe_stimuli_by_normalized_word(q.all())

    entries: list[dict[str, Any]] = []
    for st in stimuli:
        raw = st.text or ""
        nw = normalize_word(raw)
        if not nw:
            continue
        entries.append(
            {
                "normalized_word": nw,
                "raw_word": raw,
                "rank": st.frequency_rank,
                "stimulus_id": st.id,
            }
        )

    import_config: dict[str, Any] = {"max_words": max_words, "dataset_id": dataset_id}
    import_summary = {"stimulus_candidates_after_dedupe": len(entries)}
    return rebuild_kb_from_lexicon_entries(
        db,
        entries=entries,
        label=label,
        source_kind="stimulus_adapter",
        source_name=f"dataset:{dataset_id}" if dataset_id else "stimulus:en",
        source_ref=None,
        import_config=import_config,
        import_summary=import_summary,
        pipeline_source=source or "rebuild_kb_from_stimuli",
        set_active=set_active,
        copy_english_segments=True,
    )


def _rebuild_analytics(
    db: Session,
    vocab_version_id: str,
    pattern_ids: dict[tuple[str, str], str],
) -> None:
    """Populate analytics_pattern_labeled and segment combos + gap snapshot."""
    # Labeled stimulus texts (legacy Annotation)
    labeled_texts: list[str] = []
    rows = (
        db.query(Stimulus.text)
        .join(Annotation, Annotation.stimulus_id == Stimulus.id)
        .filter(Stimulus.language == "en")
        .distinct()
        .all()
    )
    for (t,) in rows:
        if t:
            labeled_texts.append(t)

    # Count labeled coverage per pattern in this KB's pattern set
    counts: Counter[str] = Counter()
    for text in labeled_texts:
        seen = set(flatten_pattern_keys(all_pattern_keys_for_text(text)))
        for ut, pk in seen:
            pid = pattern_ids.get((ut, pk))
            if pid:
                counts[pid] += 1

    for pid in pattern_ids.values():
        c = int(counts.get(pid, 0))
        p = db.query(KbPattern).filter(KbPattern.id == pid).one()
        db.add(
            AnalyticsPatternLabeled(
                id=str(uuid.uuid4()),
                vocab_version_id=vocab_version_id,
                pattern_id=pid,
                count_labeled=c,
                target=pattern_target_for_unit_type(p.unit_type),
            )
        )

    # Segment combo: words in KB that have legacy annotation on stimulus
    annotated_ids = {
        s[0]
        for s in db.query(Stimulus.id)
        .join(Annotation, Annotation.stimulus_id == Stimulus.id)
        .filter(Stimulus.language == "en")
        .all()
    }

    combo_counts: Counter[str] = Counter()
    kws = db.query(KbWord).filter(KbWord.vocab_version_id == vocab_version_id).all()
    for kw in kws:
        if not kw.stimulus_id or kw.stimulus_id not in annotated_ids:
            continue
        nseg = (
            db.query(KbSegmentInstance)
            .filter(
                KbSegmentInstance.kb_word_id == kw.id,
                KbSegmentInstance.vocab_version_id == vocab_version_id,
            )
            .count()
        )
        lbl = "none"
        first = (
            db.query(KbSegmentLabel)
            .join(KbSegmentInstance, KbSegmentInstance.id == KbSegmentLabel.segment_instance_id)
            .filter(
                KbSegmentInstance.kb_word_id == kw.id,
                KbSegmentInstance.vocab_version_id == vocab_version_id,
            )
            .first()
        )
        if first and first.label_value:
            lbl = (first.label_value or "none")[:80]
        ck = f"wlen:{min(kw.length, 40)}|nseg:{min(nseg, 10)}|lab:{lbl}"
        combo_counts[ck] += 1

    for ck, c in combo_counts.items():
        db.add(
            AnalyticsSegmentComboLabeled(
                id=str(uuid.uuid4()),
                vocab_version_id=vocab_version_id,
                combo_key=ck,
                count_labeled=int(c),
                variance_lab=None,
            )
        )

    kb_wc = db.query(KbWord).filter(KbWord.vocab_version_id == vocab_version_id).count()
    gap_payload = {
        "kb_lexicon": {
            "word_count": kb_wc,
            "note": "KB snapshot corpus size (lexicon entries), not labeled annotation count.",
        },
        "under_covered_patterns": _top_pattern_gaps(db, vocab_version_id, pattern_ids, labeled_texts),
        "segment_combos": [{"combo_key": k, "count_labeled": v} for k, v in combo_counts.most_common(40)],
    }
    db.add(
        AnalyticsGapSnapshot(
            id=str(uuid.uuid4()),
            vocab_version_id=vocab_version_id,
            gap_json=json.dumps(gap_payload),
        )
    )


def _top_pattern_gaps(
    db: Session,
    vocab_version_id: str,
    pattern_ids: dict[tuple[str, str], str],
    labeled_texts: list[str],
) -> list[dict[str, object]]:
    # labeled count per pid
    counts: Counter[str] = Counter()
    for text in labeled_texts:
        for ut, pk in set(flatten_pattern_keys(all_pattern_keys_for_text(text))):
            pid = pattern_ids.get((ut, pk))
            if pid:
                counts[pid] += 1

    gaps: list[tuple[float, str, str, str, int, int]] = []
    for (ut, pk), pid in pattern_ids.items():
        p = db.query(KbPattern).filter(KbPattern.id == pid).one()
        tgt = pattern_target_for_unit_type(p.unit_type)
        c = counts.get(pid, 0)
        deficit = max(0.0, float(tgt - c)) / float(max(1, tgt))
        if deficit > 0:
            gaps.append((deficit, pid, ut, pk, c, tgt))
    gaps.sort(reverse=True, key=lambda x: x[0])
    out: list[dict[str, object]] = []
    for deficit, pid, ut, pk, c, tgt in gaps[:50]:
        out.append(
            {
                "pattern_id": pid,
                "unit_type": ut,
                "pattern_key": pk,
                "count_labeled": c,
                "target": tgt,
                "deficit": round(deficit, 4),
            }
        )
    return out


def recompute_patterns_for_version(db: Session, vid: str) -> dict[str, int]:
    """
    Drop and recompute KbPattern / KbWordPattern / KbPatternPosition / KbLetterNeighbor
    for an existing KbVocabVersion without touching KbWord or the version metadata.
    Returns counts of rows written.
    """
    from app.models import KbLetterNeighbor, KbPatternPosition, KbWordPattern

    # Drop dependent tables first (FK order)
    db.query(KbWordPattern).filter(KbWordPattern.vocab_version_id == vid).delete(synchronize_session=False)
    db.query(KbPatternPosition).filter(KbPatternPosition.vocab_version_id == vid).delete(synchronize_session=False)
    db.query(KbLetterNeighbor).filter(KbLetterNeighbor.vocab_version_id == vid).delete(synchronize_session=False)
    db.query(AnalyticsPatternLabeled).filter(AnalyticsPatternLabeled.vocab_version_id == vid).delete(synchronize_session=False)
    db.query(AnalyticsSegmentComboLabeled).filter(AnalyticsSegmentComboLabeled.vocab_version_id == vid).delete(synchronize_session=False)
    db.query(KbPattern).filter(KbPattern.vocab_version_id == vid).delete(synchronize_session=False)
    db.flush()

    words = db.query(KbWord).filter(KbWord.vocab_version_id == vid).all()
    english_by_norm = _english_latest_by_normalized(db)
    word_rows: list[tuple[KbWord, str]] = [(w, w.normalized_word) for w in words]

    _populate_kb_tables_after_words(db, vid, word_rows, english_by_norm)
    db.commit()

    pattern_count = db.query(KbPattern).filter(KbPattern.vocab_version_id == vid).count()
    return {"words": len(words), "patterns": pattern_count}


def get_active_vocab_version_id(db: Session) -> str | None:
    row = db.query(KbVocabVersion).filter(KbVocabVersion.is_active == True).order_by(KbVocabVersion.created_at.desc()).first()  # noqa: E712
    return row.id if row else None
