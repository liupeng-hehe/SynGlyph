"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { GrainientBg } from "@/components/GrainientBg";
import {
  getStimulus,
  createSession,
  commitAnnotation,
  createAnnotation,
  getPrioritizedStimuli,
  createStimulus,
  listStimuli,
  listPendingStimuli,
  listAnnotations,
  listDatasets,
  fetchLetterPriors,
  getLetterSequencePredict,
} from "@/lib/api";
import { fetchCoverageProgress, type CoverageProgressResponse } from "@/lib/kbApi";
import type { Stimulus, SegmentInput, LetterPriorsResponse } from "@synglyph/shared";
import { hexToLab, labToHex } from "@synglyph/shared";
import { hexWithHash, SegmentColumn, BoundaryAxis } from "@/components/english/AnnotateGlyphControls";

function hexWithoutHash(hex: string) {
  return hex.replace(/^#/, "");
}

function blendHex(hexLeft: string, hexRight: string, t: number): string {
  const l = hexWithoutHash(hexLeft).padStart(6, "0");
  const r = hexWithoutHash(hexRight).padStart(6, "0");
  const r1 = parseInt(l.slice(0, 2), 16), g1 = parseInt(l.slice(2, 4), 16), b1 = parseInt(l.slice(4, 6), 16);
  const r2 = parseInt(r.slice(0, 2), 16), g2 = parseInt(r.slice(2, 4), 16), b2 = parseInt(r.slice(4, 6), 16);
  const rr = Math.round(r1 * t + r2 * (1 - t));
  const gg = Math.round(g1 * t + g2 * (1 - t));
  const bb = Math.round(b1 * t + b2 * (1 - t));
  return [rr, gg, bb].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

function getSegmentsFromSplits(word: string, splits: number[]): string[] {
  const sorted = [...splits].sort((a, b) => a - b).filter((s) => s > 0 && s < word.length);
  if (sorted.length === 0) return [word];
  const segments: string[] = [];
  let start = 0;
  for (const s of sorted) {
    segments.push(word.slice(start, s));
    start = s;
  }
  segments.push(word.slice(start));
  return segments.filter((x) => x.length > 0);
}

function getSplitsFromRaw(word: string, raw: string): number[] {
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [];
  const splits: number[] = [];
  let pos = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    pos += parts[i].length;
    splits.push(pos);
  }
  return splits;
}

const DEFAULT_LAB: [number, number, number] = [100, 0, 0];

function computeEditBurden(
  final: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }>,
  predicted: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }>
): number {
  const keys = Object.keys(final);
  if (keys.length === 0) return 0;
  let total = 0;
  for (const k of keys) {
    const f = final[Number(k)];
    const p = predicted[Number(k)];
    if (!f || !p) continue;
    const dL = Math.abs(f.color_lab[0] - p.color_lab[0]) / 100;
    const dA = Math.abs(f.color_lab[1] - p.color_lab[1]) / 255;
    const dB = Math.abs(f.color_lab[2] - p.color_lab[2]) / 255;
    const colorDelta = (dL + dA + dB) / 3;
    total += 0.45 * colorDelta + 0.20 * Math.abs(f.prominence - p.prominence) + 0.20 * Math.abs(f.spread - p.spread);
  }
  return Math.min(1, total / keys.length);
}

function segmentCharStarts(segments: string[]): number[] {
  const out: number[] = [];
  let p = 0;
  for (const seg of segments) {
    out.push(p);
    p += seg.length;
  }
  return out;
}

function averageSegmentAttrs(
  attrs: Array<{ color_lab: [number, number, number]; prominence: number; spread: number }>
): { color_lab: [number, number, number]; prominence: number; spread: number } {
  if (attrs.length === 0) return { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
  if (attrs.length === 1) return { ...attrs[0] };
  let L = 0;
  let a = 0;
  let b = 0;
  let p = 0;
  let s = 0;
  for (const x of attrs) {
    L += x.color_lab[0];
    a += x.color_lab[1];
    b += x.color_lab[2];
    p += x.prominence;
    s += x.spread;
  }
  const n = attrs.length;
  return {
    color_lab: [L / n, a / n, b / n],
    prominence: p / n,
    spread: s / n,
  };
}

function buildCharAttrsFromSegmentAttrs(
  segments: string[],
  segmentAttrs: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }>
): Record<number, { prominence: number; spread: number }> {
  const out: Record<number, { prominence: number; spread: number }> = {};
  let pos = 0;
  segments.forEach((seg, segIdx) => {
    const sa = segmentAttrs[segIdx] ?? { prominence: 0, spread: 0 };
    const pr = sa.prominence ?? 0;
    const sp = sa.spread ?? 0;
    for (let i = 0; i < seg.length; i++) {
      out[pos + i] = { prominence: pr, spread: sp };
    }
    pos += seg.length;
  });
  return out;
}

const DRAG_UP_THRESHOLD = 40;

function AnnotatePageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromAl = searchParams.get("from") === "al";
  const selectedListIdFromQuery = searchParams.get("selected_list_id");
  const queueSource = searchParams.get("queue_source") === "kb" ? "kb" : "stimulus";
  const stimulusId = params.stimulusId as string;
  const [stimulus, setStimulus] = useState<Stimulus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stimuliList, setStimuliList] = useState<{ id: string; text: string }[]>([]);
  const [splits, setSplits] = useState<number[]>([]);
  const [segmentAttrs, setSegmentAttrs] = useState<Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }>>({});
  const [charAttrs, setCharAttrs] = useState<Record<number, { prominence: number; spread: number }>>({});
  const [selectedCharIndex, setSelectedCharIndex] = useState<number | null>(null);
  const [boundaryInfluence, setBoundaryInfluence] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const loadAlQueueWords = useCallback(async (): Promise<{ id: string; text: string }[]> => {
    const selectedListId = selectedListIdFromQuery || stimulus?.dataset_id || undefined;
    const data = await getPrioritizedStimuli(200, selectedListId, true, true, queueSource);
    return data.rows.map((s) => ({ id: s.stimulus_id, text: s.text }));
  }, [selectedListIdFromQuery, stimulus?.dataset_id, queueSource]);

  const [bgColors, setBgColors] = useState<string[]>([]);
  const [letterPriors, setLetterPriors] = useState<LetterPriorsResponse>({});
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [migrateDatasetIds, setMigrateDatasetIds] = useState<string[]>([]);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [coverageProgress, setCoverageProgress] = useState<CoverageProgressResponse | null>(null);
  const [preprocHint, setPreprocHint] = useState<string | null>(null);
  // Snapshot of the model's predicted attrs at session start — used to compute edit_burden at commit time
  const predictedAttrsSnapshotRef = useRef<Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }> | null>(null);
  const dragRef = useRef<{ index: number; startY: number } | null>(null);
  const prevSplitsRef = useRef<number[] | null>(null);
  const prevWordRef = useRef("");
  const segmentAttrsRef = useRef(segmentAttrs);
  segmentAttrsRef.current = segmentAttrs;
  const boundaryInfluenceRef = useRef(boundaryInfluence);
  boundaryInfluenceRef.current = boundaryInfluence;

  const word = stimulus?.text ?? "";
  const segments = useMemo(() => getSegmentsFromSplits(word, splits), [word, splits]);

  function addColorToBg(hex: string) {
    const h = hexWithoutHash(hex).padStart(6, "0");
    if (!h || h === "000000") return;
    setBgColors((prev) => {
      const next = prev.filter((c) => c !== h);
      next.unshift(h);
      return next;
    });
  }

  const handleRemoveSplit = useCallback((index: number) => {
    setSplits((prev) => prev.filter((i) => i !== index));
  }, []);

  const handleDividerMouseDown = useCallback((index: number, clientY: number) => {
    dragRef.current = { index, startY: clientY };
  }, []);

  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !splits.includes(d.index)) return;
      const dy = e.clientY - d.startY;
      if (dy < -DRAG_UP_THRESHOLD) handleRemoveSplit(d.index);
    }
    function onTouchEnd(e: TouchEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !splits.includes(d.index) || !e.changedTouches[0]) return;
      const dy = e.changedTouches[0].clientY - d.startY;
      if (dy < -DRAG_UP_THRESHOLD) handleRemoveSplit(d.index);
    }
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [splits, handleRemoveSplit]);

  useEffect(() => {
    getStimulus(stimulusId)
      .then(setStimulus)
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [stimulusId]);
  useEffect(() => {
    createSession()
      .then((s) => setSessionId(s.id))
      .catch((e) => {
        setSessionId(null);
        setMessage(e instanceof Error ? e.message : String(e));
      });
  }, []);
  useEffect(() => {
    if (!stimulus) return;
    if (fromAl) {
      loadAlQueueWords()
        .then(setStimuliList)
        .catch(() => setStimuliList([]));
      return;
    }
    listPendingStimuli(5000, stimulus.dataset_id ?? undefined)
      .then((list) => setStimuliList(list.map((s) => ({ id: s.id, text: s.text }))))
      .catch(() => setStimuliList([]));
  }, [stimulus, fromAl, loadAlQueueWords]);

  useEffect(() => {
    listDatasets()
      .then((list) => setDatasets(list.map((d) => ({ id: d.id, name: d.name }))))
      .catch(() => setDatasets([]));
  }, []);

  useEffect(() => {
    fetchCoverageProgress()
      .then(setCoverageProgress)
      .catch(() => setCoverageProgress(null));
  }, []);

  useEffect(() => {
    const ids = migrateDatasetIds.length > 0 ? migrateDatasetIds : undefined;
    fetchLetterPriors(ids)
      .then(setLetterPriors)
      .catch(() => setLetterPriors({}));
  }, [migrateDatasetIds]);

  useEffect(() => {
    setSegmentAttrs((prev) => {
      const next = { ...prev };
      segments.forEach((_, segIdx) => {
        if (!(segIdx in next)) next[segIdx] = { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
      });
      return next;
    });
  }, [segments.join("|")]);

  useEffect(() => {
    setSelectedCharIndex((idx) => (idx !== null && idx >= word.length ? null : idx));
  }, [word.length]);

  useEffect(() => {
    const n = Math.max(0, segments.length - 1);
    setBoundaryInfluence((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(0.5);
      return next.slice(0, n);
    });
  }, [segments.length]);

  useEffect(() => {
    setCharAttrs((prev) => {
      const next = { ...prev };
      let pos = 0;
      segments.forEach((seg, segIdx) => {
        const segAttrs = segmentAttrs[segIdx] ?? { prominence: 0, spread: 0 };
        for (let i = 0; i < seg.length; i++) {
          const idx = pos + i;
          if (!(idx in next)) next[idx] = { prominence: segAttrs.prominence ?? 0, spread: segAttrs.spread ?? 0 };
        }
        pos += seg.length;
      });
      return next;
    });
  }, [segments.join("|"), segmentAttrs]);

  useEffect(() => {
    if (!word) return;

    if (prevWordRef.current !== word) {
      prevWordRef.current = word;
      prevSplitsRef.current = [...splits];
      return;
    }

    const prevSplits = prevSplitsRef.current;
    if (prevSplits === null) {
      prevSplitsRef.current = [...splits];
      return;
    }

    const prevKey = [...prevSplits].sort((a, b) => a - b).join(",");
    const nextKey = [...splits].sort((a, b) => a - b).join(",");
    if (prevKey === nextKey) return;

    const oldSegs = getSegmentsFromSplits(word, prevSplits);
    const newSegs = getSegmentsFromSplits(word, splits);
    const oldStarts = segmentCharStarts(oldSegs);
    const newStarts = segmentCharStarts(newSegs);

    const prevAttrs = segmentAttrsRef.current;
    const nextSegmentAttrs: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }> = {};
    for (let j = 0; j < newSegs.length; j++) {
      const ns = newStarts[j];
      const ne = ns + newSegs[j].length;
      const contributing: number[] = [];
      for (let i = 0; i < oldSegs.length; i++) {
        const os = oldStarts[i];
        const oe = os + oldSegs[i].length;
        if (ns < oe && ne > os) contributing.push(i);
      }
      const merged = contributing.map((i) =>
        prevAttrs[i] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 }
      );
      nextSegmentAttrs[j] = averageSegmentAttrs(merged);
    }

    const oldLen = oldSegs.length - 1;
    const newLen = newSegs.length - 1;
    const prevBi = boundaryInfluenceRef.current;
    const newBi: number[] = [];
    for (let j = 0; j < newLen; j++) {
      const charPos = newStarts[j + 1];
      let found = 0.5;
      for (let k = 0; k < oldLen; k++) {
        if (oldStarts[k + 1] === charPos) {
          found = prevBi[k] ?? 0.5;
          break;
        }
      }
      newBi[j] = found;
    }

    setSegmentAttrs(nextSegmentAttrs);
    setCharAttrs(buildCharAttrsFromSegmentAttrs(newSegs, nextSegmentAttrs));
    setBoundaryInfluence(newBi);
    prevSplitsRef.current = [...splits];
  }, [word, splits]);

  useEffect(() => {
    if (!stimulusId || !stimulus?.text || fromAl) return;
    listAnnotations(1, undefined, stimulusId).then((list) => {
      const ann = list[0];
      if (!ann?.segmentation?.raw_input) return;
      const raw = ann.segmentation.raw_input;
      const loadedSplits = getSplitsFromRaw(stimulus.text, raw);
      prevSplitsRef.current = [...loadedSplits];
      setSplits(loadedSplits);
      const seg = ann.segmentation;
      if (seg?.spans) {
        const attrs: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }> = {};
        const charAttrsInit: Record<number, { prominence: number; spread: number }> = {};
        let charIdx = 0;
        seg.spans.forEach((s, spanOrder) => {
          const lab = s.color_lab ?? [70, 0, 0];
          attrs[spanOrder] = {
            color_lab: [lab[0], lab[1], lab[2]],
            prominence: s.prominence ?? 0.5,
            spread: s.spread ?? 0.5,
          };
          const p = s.prominence ?? 0.5;
          const sp = s.spread ?? 0.5;
          for (let i = 0; i < (s.span_text?.length ?? 0); i++) {
            charAttrsInit[charIdx++] = { prominence: p, spread: sp };
          }
        });
        setSegmentAttrs((prev) => ({ ...prev, ...attrs }));
        setCharAttrs((prev) => ({ ...prev, ...charAttrsInit }));
        if (seg.boundary_influence && Array.isArray(seg.boundary_influence)) {
          setBoundaryInfluence(seg.boundary_influence);
        }
        const hexes = seg.spans.map((s) => labToHex(s.color_lab[0], s.color_lab[1], s.color_lab[2])).filter((h) => h !== "000000");
        setBgColors((prev) => {
          const next = [...prev];
          hexes.reverse().forEach((h) => { if (!next.includes(h)) next.unshift(h); });
          return next;
        });
      }
    });
  }, [stimulusId, stimulus?.text, fromAl]);

  useEffect(() => {
    if (!stimulusId || !stimulus?.text) return;
    let cancelled = false;
    getLetterSequencePredict(stimulusId)
      .then((data) => {
        if (cancelled) return;
        const w = stimulus.text!;
        if (data.preprocessing && (data.preprocessing.syllable_count > 0 || data.preprocessing.stress_pattern)) {
          setPreprocHint(
            `Syllable hint: ${data.preprocessing.syllable_count} · pattern ${data.preprocessing.stress_pattern || "—"}`
          );
        } else {
          setPreprocHint(null);
        }
        if (data.pred_lab.length !== w.length) return;
        const perCharSplits = Array.from({ length: w.length - 1 }, (_, i) => i + 1);
        const newSegments = getSegmentsFromSplits(w, perCharSplits);
        const attrs: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }> = {};
        newSegments.forEach((_, segIdx) => {
          const lab = data.pred_lab[segIdx];
          attrs[segIdx] = {
            color_lab: [lab[0], lab[1], lab[2]],
            prominence: data.pred_prominence[segIdx],
            spread: data.pred_spread[segIdx],
          };
        });
        // Always store snapshot for edit_burden computation at commit time
        predictedAttrsSnapshotRef.current = attrs;

        if (fromAl) {
          // AL flow: use prediction as initial editing state
          prevSplitsRef.current = [...perCharSplits];
          setSplits(perCharSplits);
          const charAttrsInit: Record<number, { prominence: number; spread: number }> = {};
          newSegments.forEach((_, segIdx) => {
            charAttrsInit[segIdx] = { prominence: data.pred_prominence[segIdx], spread: data.pred_spread[segIdx] };
          });
          setSegmentAttrs(attrs);
          setCharAttrs(charAttrsInit);
          if (data.pred_boundary.length > 0) setBoundaryInfluence(data.pred_boundary);
          else setBoundaryInfluence([]);
          const hexes = data.pred_lab.map((lab) => labToHex(lab[0], lab[1], lab[2])).filter((h) => h !== "000000");
          setBgColors((prev) => {
            const next = [...prev];
            hexes.reverse().forEach((h) => { if (!next.includes(h)) next.unshift(h); });
            return next;
          });
          setMessage("已加载当前模型的字母预测");
        }
      })
      .catch(() => { /* prediction unavailable — silent */ });
    return () => {
      cancelled = true;
    };
  }, [stimulusId, stimulus?.text, fromAl]);

  function handleDoubleClickBetween(index: number) {
    setSplits((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }

  function updateSegmentAttr(segIdx: number, updates: Partial<{ color_lab: [number, number, number]; prominence: number; spread: number }>) {
    setSegmentAttrs((prev) => {
      const cur = prev[segIdx];
      if (!cur) return prev;
      return { ...prev, [segIdx]: { ...cur, ...updates } };
    });
    // Keep per-char P/S in sync for segment-level updates so visualization updates immediately.
    if (updates.prominence !== undefined || updates.spread !== undefined) {
      const segStart = segments.slice(0, segIdx).reduce((sum, s) => sum + s.length, 0);
      const segLen = segments[segIdx]?.length ?? 0;
      setCharAttrs((prev) => {
        const next = { ...prev };
        for (let i = 0; i < segLen; i++) {
          const idx = segStart + i;
          const cur = next[idx] ?? { prominence: 0, spread: 0 };
          next[idx] = {
            prominence: updates.prominence !== undefined ? updates.prominence : cur.prominence,
            spread: updates.spread !== undefined ? updates.spread : cur.spread,
          };
        }
        return next;
      });
    }
  }

  function updateCharAttr(charIdx: number, updates: { prominence?: number; spread?: number }) {
    setCharAttrs((prev) => {
      const cur = prev[charIdx] ?? { prominence: 0, spread: 0 };
      return { ...prev, [charIdx]: { ...cur, ...updates } };
    });
  }

  function applyLetterPriors() {
    if (!word || Object.keys(letterPriors).length === 0) {
      setMessage("暂无字母先验数据");
      return;
    }
    const perCharSplits = Array.from({ length: word.length - 1 }, (_, i) => i + 1);
    prevSplitsRef.current = [...perCharSplits];
    setSplits(perCharSplits);
    const newSegments = getSegmentsFromSplits(word, perCharSplits);
    const nextAttrs: Record<number, { color_lab: [number, number, number]; prominence: number; spread: number }> = {};
    newSegments.forEach((seg, segIdx) => {
      const prior = seg.length === 1 ? (letterPriors[seg.toLowerCase()] ?? letterPriors[seg.toUpperCase()]) : null;
      if (prior) {
        nextAttrs[segIdx] = {
          color_lab: [
            Math.max(0, Math.min(100, prior.avg_l)),
            Math.max(-128, Math.min(127, prior.avg_a)),
            Math.max(-128, Math.min(127, prior.avg_b)),
          ],
          prominence: Math.max(0, Math.min(1, prior.avg_prominence)),
          spread: Math.max(0, Math.min(1, prior.avg_spread)),
        };
      } else {
        nextAttrs[segIdx] = segmentAttrsRef.current[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
      }
    });
    setSegmentAttrs(nextAttrs);
    setCharAttrs(buildCharAttrsFromSegmentAttrs(newSegments, nextAttrs));
    setMessage(`已填充 ${newSegments.filter((s) => s.length === 1 && (letterPriors[s.toLowerCase()] ?? letterPriors[s.toUpperCase()])).length} 个字母的先验`);
  }

  async function handleSaveAndNext() {
    if (!sessionId) { setMessage("Session not ready"); return; }
    const concat = segments.join("");
    if (concat !== word) {
      setMessage("Segments must cover the word exactly");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      let targetStimulusId = stimulusId;
      let targetDatasetId = stimulus?.dataset_id ?? null;
      if (fromAl && queueSource === "kb" && !targetDatasetId && !selectedListIdFromQuery) {
        setMessage("KB queue mode requires a target dataset. Please go back to Workbench and select one.");
        return;
      }
      if (!targetDatasetId && selectedListIdFromQuery) {
        targetDatasetId = selectedListIdFromQuery;
        // Ensure the word exists in selected dataset so word-list totals/annotated totals can track it.
        const existing = (await listStimuli(5000, targetDatasetId)).find(
          (s) => (s.text || "").toLowerCase() === (word || "").toLowerCase()
        );
        if (existing) {
          targetStimulusId = existing.id;
        } else {
          const created = await createStimulus({
            text: word,
            language: stimulus?.language || "en",
            source_type: "al_annotation",
            dataset_id: targetDatasetId,
          });
          targetStimulusId = created.id;
        }
      }

      let pos = 0;
      const payload: SegmentInput[] = segments.map((seg, segIdx) => {
        const attrs = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
        let sumP = 0, sumS = 0, n = 0;
        for (let i = 0; i < seg.length; i++) {
          const ca = charAttrs[pos + i];
          sumP += ca?.prominence ?? attrs.prominence ?? 0;
          sumS += ca?.spread ?? attrs.spread ?? 0;
          n++;
        }
        pos += seg.length;
        const p = Number(Math.max(0, Math.min(1, n > 0 ? sumP / n : attrs.prominence ?? 0)));
        const s = Number(Math.max(0, Math.min(1, n > 0 ? sumS / n : attrs.spread ?? 0)));
        const [L, a, b] = attrs.color_lab;
        const colorLab: [number, number, number] = [
          Number(Math.max(0, Math.min(100, L ?? 70))),
          Number(Math.max(-128, Math.min(127, a ?? 0))),
          Number(Math.max(-128, Math.min(127, b ?? 0))),
        ];
        return { text_span: seg, color_lab: colorLab, prominence: p, spread: s };
      });
      if (targetDatasetId) {
        const predicted = predictedAttrsSnapshotRef.current;
        const editBurden = predicted ? computeEditBurden(segmentAttrs, predicted) : undefined;
        const predictedSegments = predicted
          ? segments.map((seg, i) => {
              const p = predicted[i] ?? { color_lab: [100, 0, 0] as [number, number, number], prominence: 0, spread: 0 };
              return { text_span: seg, color_lab: p.color_lab, prominence: p.prominence, spread: p.spread };
            })
          : undefined;
        await commitAnnotation({
          session_id: sessionId,
          stimulus_id: targetStimulusId,
          segments: payload,
          boundary_influence: boundaryInfluence.length > 0 ? boundaryInfluence : undefined,
          selected_list_id: targetDatasetId,
          word,
          predicted_segments: predictedSegments,
          edit_burden: editBurden,
        });
      } else {
        // Still persist annotation for global/no-dataset stimuli.
        await createAnnotation({
          session_id: sessionId,
          stimulus_id: targetStimulusId,
          segments: payload,
          boundary_influence: boundaryInfluence.length > 0 ? boundaryInfluence : undefined,
        });
      }
      let nextList = stimuliList.filter((s) => s.id !== stimulusId);
      if (fromAl) {
        try {
          // Re-fetch queue after commit so we always jump by the latest AL ordering.
          nextList = (await loadAlQueueWords()).filter((s) => s.id !== stimulusId);
        } catch {
          // Fallback to local in-memory queue list.
        }
      }
      setStimuliList(nextList);
      const next = nextList[0];
      if (next && next.id !== stimulusId) {
        const qs = new URLSearchParams();
        if (fromAl) qs.set("from", "al");
        if (selectedListIdFromQuery) qs.set("selected_list_id", selectedListIdFromQuery);
        if (fromAl) qs.set("queue_source", queueSource);
        const q = qs.toString();
        router.push(`/annotate/${next.id}${q ? `?${q}` : ""}`);
      } else {
        setMessage("Saved!");
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // Per-character: segment color + 边界晕染渐变。靠近边界的字符更多被融合色影响，远离的保持本段色。
  const charColors = useMemo(() => {
    const result: { hex: string; prominence: number; spread: number; segIdx: number }[] = [];
    let pos = 0;
    const hexes = segments.map((_, segIdx) => {
      const a = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
      return labToHex(a.color_lab[0], a.color_lab[1], a.color_lab[2]);
    });
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segAttrs = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
      const segHex = hexes[segIdx];
      const leftHex = segIdx > 0 ? hexes[segIdx - 1] : null;
      const rightHex = segIdx < segments.length - 1 ? hexes[segIdx + 1] : null;
      const infPrev = boundaryInfluence[segIdx - 1] ?? 0.5;
      const infNext = boundaryInfluence[segIdx] ?? 0.5;
      const n = segments[segIdx].length;
      for (let i = 0; i < n; i++) {
        const charIdx = pos + i;
        const ca = charAttrs[charIdx];
        let hex = segHex;
        // 左边界：r 比 o 更靠近 P，r 更多被 P 色晕染。权重 (1 - i/n)，首字=1，末字=0
        if (leftHex && segIdx > 0 && infPrev > 0.5) {
          const leftWeight = (infPrev - 0.5) * 2 * (1 - i / n);
          hex = blendHex(leftHex, hex, leftWeight);
        }
        // 右边界：末字比首字更多被右侧色晕染。权重 (i+1)/n，首字=0，末字=1
        if (rightHex && segIdx < segments.length - 1 && infNext < 0.5) {
          const rightAmount = (1 - 2 * infNext) * (i + 1) / n;
          hex = blendHex(hex, rightHex, 1 - rightAmount);
        }
        result.push({
          hex,
          prominence: ca?.prominence ?? segAttrs.prominence ?? 0,
          spread: ca?.spread ?? segAttrs.spread ?? 0,
          segIdx,
        });
      }
      pos += n;
    }
    return result;
  }, [segments, segmentAttrs, charAttrs, boundaryInfluence]);

  if (!stimulus) {
    return (
      <GrainientBg colors={bgColors} className="-m-6 min-h-screen">
        <div className="flex min-h-screen items-center justify-center"><p className="text-white/70">Loading...</p></div>
      </GrainientBg>
    );
  }

  return (
    <GrainientBg colors={bgColors} className="-m-6 relative min-h-screen">
      <div className="absolute left-4 top-4">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">← Home</Link>
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <p className="mb-4 text-sm text-white/60">
          Double-click between letters to split · Drag boundary line up to remove · Click letter to adjust P×S
        </p>

        <div className="mb-4 w-full max-w-md">
          <button
            type="button"
            onClick={() => setMigrateOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg border border-white/30 bg-[#1a1a24] px-4 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            <span>从已有数据迁移字母先验</span>
            <span className="text-white/50">{migrateOpen ? "▲" : "▼"}</span>
          </button>
          {migrateOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-white/20 bg-[#1a1a24]/80 p-4">
              <p className="text-xs text-white/60">
                选择从哪些 dataset 迁移（不选则使用全部）：
              </p>
              <div className="flex flex-wrap gap-2">
                {datasets.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-white/10">
                    <input
                      type="checkbox"
                      checked={migrateDatasetIds.includes(d.id)}
                      onChange={() => {
                        setMigrateDatasetIds((prev) =>
                          prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                        );
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-white/80">{d.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-white/50">
                当前可用: {Object.keys(letterPriors).length} 个字母
              </p>
              <button
                type="button"
                onClick={applyLetterPriors}
                className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50"
                disabled={Object.keys(letterPriors).length === 0}
              >
                按字母填充先验
              </button>
            </div>
          )}
        </div>

        {coverageProgress && (
          <div className="mb-6 w-full max-w-md rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-xs text-white/70">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-white/90">Pattern coverage</span>
              {coverageProgress.next_recommended[0] && (
                <span className="text-white/50">
                  Next: <span className="text-sky-300">{coverageProgress.next_recommended[0].word}</span>
                  {" "}(+{coverageProgress.next_recommended[0].new_patterns_covered})
                </span>
              )}
            </div>
            {[
              { label: "Letters", tier: coverageProgress.char_coverage },
              { label: "Bigrams", tier: coverageProgress.bigram_coverage },
              { label: "Trigrams", tier: coverageProgress.trigram_coverage },
            ].map(({ label, tier }) =>
              tier ? (
                <div key={label} className="mb-1 flex items-center gap-2">
                  <span className="w-14 text-right text-white/50">{label}</span>
                  <div className="relative h-2 flex-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-400/70 transition-all"
                      style={{ width: `${(tier.pct * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="w-16 tabular-nums text-white/60">
                    {tier.covered}/{tier.total}
                  </span>
                </div>
              ) : null
            )}
          </div>
        )}

        <div className="mb-12 flex flex-wrap justify-center gap-0 font-bold tracking-tight text-white" style={{ fontSize: "clamp(3rem, 12vw, 8rem)" }}>
          {word.split("").map((char, i) => {
            const { hex, prominence, spread } = charColors[i] ?? { hex: labToHex(100, 0, 0), prominence: 0, spread: 0 };
            const haloSize = 4 + prominence * 24;
            const opacity = 0.5 + (1 - spread) * 0.5;
            const textBlur = spread * 1.5;
            return (
              <span key={i} className="relative inline-block">
                {i > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => handleDividerMouseDown(i, e.clientY)}
                    onTouchStart={(e) => handleDividerMouseDown(i, e.touches[0].clientY)}
                    onDoubleClick={() => handleDoubleClickBetween(i)}
                    className={`absolute left-0 top-0 flex h-full w-4 -translate-x-1/2 cursor-pointer items-center justify-center hover:bg-white/20 ${splits.includes(i) ? "border-l-2 border-white/60" : ""}`}
                    title={splits.includes(i) ? "Double-click to toggle, drag up to remove split" : "Double-click to add split"}
                  >
                    {splits.includes(i) && <span className="pointer-events-none h-full w-px bg-white/50" />}
                  </span>
                )}
                <span
                  style={{
                    color: hexWithHash(hex),
                    textShadow: `0 0 ${haloSize}px ${hexWithHash(hex)}`,
                    opacity,
                    filter: textBlur > 0 ? `blur(${textBlur}px)` : undefined,
                  }}
                  onClick={() => setSelectedCharIndex(i)}
                  onDoubleClick={() => addColorToBg(hex)}
                  className={`cursor-pointer select-none ${selectedCharIndex === i ? "ring-2 ring-white ring-offset-2 ring-offset-transparent rounded" : ""}`}
                  title="Click to adjust P×S · Double-click to add color to background"
                >
                  {char}
                </span>
              </span>
            );
          })}
        </div>
        {preprocHint && (
          <p className="mb-2 text-center text-xs text-white/40 tabular-nums" aria-label="Syllable hint">
            {preprocHint}
          </p>
        )}

        <p className="mb-2 text-xs text-white/50">
          Double-click letter or color swatch to add to background
          {bgColors.length > 0 && (
            <button type="button" onClick={() => setBgColors([])} className="ml-2 rounded px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white/90">Reset</button>
          )}
        </p>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
          {segments.map((seg, segIdx) => {
            const attrs = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
            const hex = labToHex(attrs.color_lab[0], attrs.color_lab[1], attrs.color_lab[2]);
            const segStart = segments.slice(0, segIdx).reduce((sum, s) => sum + s.length, 0);
            const selectedInThisSeg = selectedCharIndex !== null && selectedCharIndex >= segStart && selectedCharIndex < segStart + seg.length;
            const p = selectedInThisSeg && charColors[selectedCharIndex!] ? charColors[selectedCharIndex!].prominence : (attrs.prominence ?? 0);
            const s = selectedInThisSeg && charColors[selectedCharIndex!] ? charColors[selectedCharIndex!].spread : (attrs.spread ?? 0);
            const rightAttrs = segmentAttrs[segIdx + 1] ?? { color_lab: DEFAULT_LAB };
            const rightHex = segIdx < segments.length - 1 ? labToHex(rightAttrs.color_lab[0], rightAttrs.color_lab[1], rightAttrs.color_lab[2]) : hex;
            return (
              <div key={segIdx} className="flex items-end gap-2">
                {seg.length === 1 && (letterPriors[seg.toLowerCase()] ?? letterPriors[seg.toUpperCase()]) && (
                  <button
                    type="button"
                    onClick={() => {
                      const prior = letterPriors[seg.toLowerCase()] ?? letterPriors[seg.toUpperCase()]!;
                      updateSegmentAttr(segIdx, {
                        color_lab: [
                          Math.max(0, Math.min(100, prior.avg_l)),
                          Math.max(-128, Math.min(127, prior.avg_a)),
                          Math.max(-128, Math.min(127, prior.avg_b)),
                        ],
                        prominence: Math.max(0, Math.min(1, prior.avg_prominence)),
                        spread: Math.max(0, Math.min(1, prior.avg_spread)),
                      });
                    }}
                    className="mb-1 self-center rounded border border-white/30 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10"
                    title={`迁移 "${seg}" 的先验`}
                  >
                    迁移
                  </button>
                )}
                <SegmentColumn
                  label={segments.length === 1 ? "Whole word" : seg}
                  hex={hex}
                  onColorChange={(h) => {
                    const [L, a, b] = hexToLab(h);
                    updateSegmentAttr(segIdx, { color_lab: [L, a, b] });
                  }}
                  onAddToBg={() => addColorToBg(hex)}
                  prominence={p}
                  spread={s}
                  onPxSChange={(prom, spr) => {
                    if (selectedInThisSeg && selectedCharIndex !== null) {
                      updateCharAttr(selectedCharIndex, { prominence: prom, spread: spr });
                    } else {
                      updateSegmentAttr(segIdx, { prominence: prom, spread: spr });
                    }
                  }}
                />
                {segIdx < segments.length - 1 && (
                  <BoundaryAxis
                    leftHex={hex}
                    rightHex={rightHex}
                    value={boundaryInfluence[segIdx] ?? 0.5}
                    onChange={(v) => setBoundaryInfluence((prev) => {
                      const n = [...prev];
                      while (n.length <= segIdx) n.push(0.5);
                      n[segIdx] = v;
                      return n;
                    })}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="mb-2 text-xs text-white/50">
          P=prominence (halo) · S=spread (opacity/blur) · D=Diffusion (boundary gradient polarity)
        </p>
        <div className="flex gap-4">
          <button onClick={handleSaveAndNext} disabled={loading} className="rounded-full bg-sky-600 px-8 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50">Save & Next</button>
        </div>
        {message && <p className="mt-6 text-sm text-white/70">{message}</p>}
      </div>
    </GrainientBg>
  );
}

export default function AnnotatePage() {
  return (
    <Suspense
      fallback={
        <GrainientBg colors={[]} className="-m-6 min-h-screen">
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-white/70">Loading...</p>
          </div>
        </GrainientBg>
      }
    >
      <AnnotatePageInner />
    </Suspense>
  );
}
