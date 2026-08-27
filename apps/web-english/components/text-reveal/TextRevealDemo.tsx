"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { labToHex } from "@synglyph/shared";
import {
  listDatasets,
  listModelRuntimeCheckpoints,
  listModelSnapshots,
  predictLetterSequenceText,
  upsertStimuliFromEvaluation,
  type ModelRuntimeCheckpoint,
  type ModelSnapshot,
} from "@/lib/api";
import { findWordSpanAtCharIndex } from "@/lib/textRevealWordSpans";
import {
  BASE_GREY,
  FONT_FAMILY,
  POINTER_SMOOTH,
  type G,
  type RGB,
  buildCharMap,
  ensureCanvas,
  hexToRgb,
  hitTestGlyphIndex,
  layoutLineWrap,
  letterColorsSynthetic,
  punchRgbForDisplay,
  rgbToHex,
  smoothLetterLabs,
  spanPixelBounds,
  wordCharRangeAt,
} from "@/lib/textRevealCanvasUtils";
import type {
  FeedbackPayload,
  ModelFeedbackRecord,
  ReviewMode,
  SaveMode,
  SelectedSpanPayload,
  SpanClickMode,
} from "@/lib/modelFeedbackTypes";
import {
  averagePxSForLettersInSpan,
  hexForCharIndex,
  letterPredictionsInSpan,
  pxSForCharIndex,
} from "@/lib/textRevealLetterPredictions";
import { mapPForRender, mapSForRender } from "@/lib/textRevealPreviewEditorMap";
import { clamp01, visualStyleFromPxS } from "@/lib/textRevealPxSVisual";
import {
  feedbackForSpan,
  fetchCheckpointComparisonReport,
  listReviewFeedback,
  postReviewFeedback,
  type CheckpointComparisonRow,
} from "@/lib/reviewFeedbackApi";
import { ReviewClickModeToggle } from "@/components/text-reveal/ReviewClickModeToggle";
import { ReviewModeToggle } from "@/components/text-reveal/ReviewModeToggle";
import { SelectedSpanInfo } from "@/components/text-reveal/SelectedSpanInfo";
import { EvaluateWordModal } from "@/components/text-reveal/EvaluateWordModal";
import { WordEvaluateEntry } from "@/components/text-reveal/WordEvaluateEntry";

const DEFAULT_TEXT =
  "Tyger Tyger burning bright In the forests of the night What immortal hand or eye";

/** Lower = sharper per-letter Lab (less neighbor blending). Reference ~0.1–0.15 for “magazine” separation. */
const LAB_DISPLAY_SMOOTH_BLEND = 0.12;

const CANVAS_BACKGROUND = "#f5f7fb";
/** Extra soften on colored glyph pass (diffusion / “spread” feel). Lower = sharper, more legible color on canvas. */
const REVEAL_COLOR_SOFTEN_BLUR_PX = 0.48;
/** Grain over the final composite; lower reduces “gray haze” on colored text. */
const MAIN_CANVAS_GRAIN_ALPHA = 0.06;

function averageRgbForSpan(
  text: string,
  start: number,
  end: number,
  rgbByCharIndex: RGB[] | null,
  letterColorsFallback: RGB[],
  charMap: number[]
): { rgb: RGB; hex: string } | null {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = start; i <= end; i++) {
    const li = charMap[i] ?? -1;
    if (li < 0) continue;
    const c = rgbByCharIndex?.[i] ?? letterColorsFallback[li];
    if (!c) continue;
    r += c.r;
    g += c.g;
    b += c.b;
    n++;
  }
  if (n === 0) return null;
  const rgb: RGB = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  return { rgb, hex: rgbToHex(rgb.r, rgb.g, rgb.b) };
}

export function TextRevealDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sharpRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);

  const [displayText, setDisplayText] = useState(DEFAULT_TEXT);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [dpr, setDpr] = useState(1);
  const [hovering, setHovering] = useState(false);
  const ptrRef = useRef({ x: 0, y: 0 });
  const targetPtrRef = useRef({ x: 0, y: 0 });
  const followRafRef = useRef<number | null>(null);
  const [revealRx, setRevealRx] = useState(120);
  const [revealRy, setRevealRy] = useState(72);
  const [edgeFeather, setEdgeFeather] = useState(28);
  const [hoverFalloff, setHoverFalloff] = useState(1);

  const [snapshots, setSnapshots] = useState<ModelSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [runtimeCheckpoints, setRuntimeCheckpoints] = useState<ModelRuntimeCheckpoint[]>([]);
  const [selectedStableId, setSelectedStableId] = useState<string>("");
  const [inferenceBackend, setInferenceBackend] = useState<"pytorch" | "onnx">("pytorch");
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [upsertToStimuli, setUpsertToStimuli] = useState(false);
  const [upsertDatasetId, setUpsertDatasetId] = useState<string>("");
  const [reportCheckpointIds, setReportCheckpointIds] = useState<string[]>([]);
  const [reportRows, setReportRows] = useState<CheckpointComparisonRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [modelPredLab, setModelPredLab] = useState<[number, number, number][] | null>(null);
  const [modelPredProm, setModelPredProm] = useState<number[] | null>(null);
  const [modelPredSpread, setModelPredSpread] = useState<number[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelMessage, setModelMessage] = useState("");
  /** Live readout for glyph under cursor (all modes when model loaded). */
  const [modelReadout, setModelReadout] = useState<{
    ch: string;
    hex: string;
    prominence: number;
    spread: number;
  } | null>(null);

  const [reviewMode, setReviewMode] = useState<ReviewMode>("preview");
  const [spanClickMode, setSpanClickMode] = useState<SpanClickMode>("word");
  const [selectedSpan, setSelectedSpan] = useState<SelectedSpanPayload | null>(null);
  const [savedRecords, setSavedRecords] = useState<ModelFeedbackRecord[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isEvaluateModalOpen, setIsEvaluateModalOpen] = useState(false);
  const [hoverTip, setHoverTip] = useState<{
    x: number;
    y: number;
    text: string;
    hex: string;
    prominence?: number;
    spread?: number;
  } | null>(null);

  const grainBufRef = useRef<{ w: number; h: number; canvas: HTMLCanvasElement } | null>(null);
  const ensureGrain = useCallback((physW: number, physH: number): HTMLCanvasElement | null => {
    const prev = grainBufRef.current;
    if (prev && prev.w === physW && prev.h === physH) return prev.canvas;
    const c = document.createElement("canvas");
    c.width = physW;
    c.height = physH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const id = ctx.createImageData(physW, physH);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 118 + (Math.random() - 0.5) * 95;
      id.data[i] = v;
      id.data[i + 1] = v;
      id.data[i + 2] = v;
      id.data[i + 3] = 44;
    }
    ctx.putImageData(id, 0, 0);
    grainBufRef.current = { w: physW, h: physH, canvas: c };
    return c;
  }, []);

  const fontSizePx = useMemo(() => Math.min(32, Math.max(14, size.w * 0.02)), [size.w]);
  const maxWidth = useMemo(() => Math.max(200, size.w - 56), [size.w]);
  const font = `600 ${fontSizePx}px ${FONT_FAMILY}`;

  const glyphs = useMemo(() => {
    if (typeof document === "undefined") {
      return [] as G[];
    }
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = font;
    const measure = (ch: string) => ctx.measureText(ch).width;
    const lineHeight = fontSizePx * 1.2;
    const raw = layoutLineWrap(displayText, maxWidth, fontSizePx, lineHeight, measure);
    let maxY = 0;
    for (const g of raw) maxY = Math.max(maxY, g.y);
    const th = maxY + fontSizePx * 0.35;
    const pX = Math.max(24, (size.w - maxWidth) / 2);
    const pY = Math.max(48, (size.h - th) / 2);
    return raw.map((g) => ({ ...g, x: g.x + pX, y: g.y + pY }));
  }, [displayText, maxWidth, font, fontSizePx, size.w, size.h]);

  const charMap = useMemo(() => buildCharMap(displayText), [displayText]);
  const nLetters = useMemo(() => charMap.filter((i) => i >= 0).length, [charMap]);
  const letterColorsFallback = useMemo(
    () => letterColorsSynthetic(Math.max(1, nLetters)).map((rgb) => punchRgbForDisplay(rgb, 1.3)),
    [nLetters]
  );

  const rgbByCharIndex = useMemo(() => {
    if (!modelPredLab || modelPredLab.length !== displayText.length) return null;
    const smoothed = smoothLetterLabs(modelPredLab, displayText);
    const b = LAB_DISPLAY_SMOOTH_BLEND;
    return modelPredLab.map((raw, i) => {
      const s = smoothed[i]!;
      const L = raw[0]! * (1 - b) + s[0]! * b;
      const a = raw[1]! * (1 - b) + s[1]! * b;
      const bb = raw[2]! * (1 - b) + s[2]! * b;
      return punchRgbForDisplay(hexToRgb(labToHex(L, a, bb)), 1.44);
    });
  }, [modelPredLab, displayText]);

  const predictedForSelection = useMemo(() => {
    if (!selectedSpan) return null;
    return averageRgbForSpan(
      displayText,
      selectedSpan.start,
      selectedSpan.end,
      rgbByCharIndex,
      letterColorsFallback,
      charMap
    );
  }, [selectedSpan, displayText, rgbByCharIndex, letterColorsFallback, charMap]);

  const letterPredictionsForSelection = useMemo(() => {
    if (!selectedSpan) return [];
    return letterPredictionsInSpan(
      displayText,
      selectedSpan.start,
      selectedSpan.end,
      rgbByCharIndex,
      letterColorsFallback,
      charMap,
      modelPredProm,
      modelPredSpread
    );
  }, [selectedSpan, displayText, rgbByCharIndex, letterColorsFallback, charMap, modelPredProm, modelPredSpread]);

  useEffect(() => {
    listModelSnapshots(10)
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, []);

  useEffect(() => {
    listModelRuntimeCheckpoints()
      .then((r) => setRuntimeCheckpoints(r.checkpoints ?? []))
      .catch(() => setRuntimeCheckpoints([]));
  }, []);

  useEffect(() => {
    listDatasets()
      .then((rows) => {
        const simple = rows.map((r) => ({ id: r.id, name: r.name }));
        setDatasets(simple);
        setUpsertDatasetId((prev) => prev || (simple[0]?.id ?? ""));
      })
      .catch(() => setDatasets([]));
  }, []);

  useEffect(() => {
    setModelPredLab(null);
    setModelPredProm(null);
    setModelPredSpread(null);
    setModelMessage("");
    setSelectedSpan(null);
    setModelReadout(null);
  }, [displayText]);

  const checkpointKey = selectedStableId || selectedSnapshotId || "";
  const selectedStable = useMemo(
    () => runtimeCheckpoints.find((c) => c.checkpoint_id === selectedStableId),
    [runtimeCheckpoints, selectedStableId]
  );
  const stableOptions = useMemo(
    () => runtimeCheckpoints.filter((c) => c.is_stable),
    [runtimeCheckpoints]
  );

  useEffect(() => {
    let cancelled = false;
    setFeedbackLoading(true);
    listReviewFeedback(checkpointKey, displayText)
      .then((rows) => {
        if (!cancelled) setSavedRecords(rows);
      })
      .catch(() => {
        if (!cancelled) setSavedRecords([]);
      })
      .finally(() => {
        if (!cancelled) setFeedbackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkpointKey, displayText]);

  const existingForSpan = useMemo(() => {
    if (!selectedSpan) return undefined;
    return feedbackForSpan(savedRecords, displayText, selectedSpan.start, selectedSpan.end);
  }, [savedRecords, displayText, selectedSpan]);

  const avgPxSForSelection = useMemo(() => {
    if (!selectedSpan || !modelPredProm || !modelPredSpread) return null;
    return averagePxSForLettersInSpan(
      displayText,
      selectedSpan.start,
      selectedSpan.end,
      charMap,
      modelPredProm,
      modelPredSpread
    );
  }, [selectedSpan, displayText, charMap, modelPredProm, modelPredSpread]);

  useEffect(() => {
    if (!selectedSpan) setIsEvaluateModalOpen(false);
  }, [selectedSpan]);

  async function applyModelColors() {
    if (!displayText.trim()) {
      setModelMessage("请先输入文字");
      return;
    }
    setModelLoading(true);
    setModelMessage("");
    try {
      const res = await predictLetterSequenceText(displayText, selectedSnapshotId || null, {
        checkpointId: selectedStableId || null,
        backend: selectedStableId ? inferenceBackend : "pytorch",
      });
      if (res.pred_lab.length !== displayText.length) {
        setModelMessage("模型输出长度与文本不一致");
        setModelPredLab(null);
        setModelPredProm(null);
        setModelPredSpread(null);
        return;
      }
      if (res.pred_prominence.length !== displayText.length || res.pred_spread.length !== displayText.length) {
        setModelMessage("模型 P×S 输出长度与文本不一致");
        setModelPredLab(null);
        setModelPredProm(null);
        setModelPredSpread(null);
        return;
      }
      setModelPredLab(res.pred_lab.map((x) => [x[0], x[1], x[2]]));
      setModelPredProm([...res.pred_prominence]);
      setModelPredSpread([...res.pred_spread]);
      const tag =
        res.inference_backend === "onnx"
          ? "（ONNX Runtime）"
          : res.inference_backend === "pytorch"
            ? "（PyTorch）"
            : "";
      setModelMessage(
        `已用当前模型更新 Lab 与 P×S${tag}${res.runtime_note ? ` · ${res.runtime_note}` : ""}`
      );
    } catch (e) {
      setModelPredLab(null);
      setModelPredProm(null);
      setModelPredSpread(null);
      setModelMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setModelLoading(false);
    }
  }

  const measureForHit = useCallback(
    (ch: string) => {
      const c = canvasRef.current;
      if (!c) return 8;
      const ctx = c.getContext("2d");
      if (!ctx) return 8;
      ctx.font = font;
      return ctx.measureText(ch).width;
    },
    [font]
  );

  const selectedSpanBox = useMemo(() => {
    if (!selectedSpan) return null;
    return spanPixelBounds(glyphs, selectedSpan.start, selectedSpan.end, measureForHit, fontSizePx);
  }, [selectedSpan, glyphs, measureForHit, fontSizePx]);

  const syncModelReadout = useCallback(
    (clientX: number, clientY: number) => {
      if (
        !modelPredProm ||
        modelPredProm.length !== displayText.length ||
        !modelPredSpread ||
        modelPredSpread.length !== displayText.length
      ) {
        setModelReadout(null);
        return;
      }
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const idx = hitTestGlyphIndex(glyphs, x, y, font, fontSizePx, measureForHit);
      if (idx < 0) {
        setModelReadout(null);
        return;
      }
      const hex = hexForCharIndex(displayText, idx, rgbByCharIndex, letterColorsFallback, charMap);
      const ps = pxSForCharIndex(idx, displayText.length, modelPredProm, modelPredSpread);
      setModelReadout({
        ch: displayText[idx] ?? "",
        hex: hex ?? "—",
        prominence: ps?.prominence ?? 0,
        spread: ps?.spread ?? 0,
      });
    },
    [
      modelPredProm,
      modelPredSpread,
      displayText,
      glyphs,
      font,
      fontSizePx,
      measureForHit,
      rgbByCharIndex,
      letterColorsFallback,
      charMap,
    ]
  );

  const drawFrame = useCallback(() => {
    const main = canvasRef.current?.getContext("2d");
    if (!main || glyphs.length === 0) return;

    let sharp = sharpRef.current;
    let mask = maskRef.current;
    let hover = hoverRef.current;
    let work = workRef.current;
    if (!sharp) sharp = sharpRef.current = ensureCanvas();
    if (!mask) mask = maskRef.current = ensureCanvas();
    if (!hover) hover = hoverRef.current = ensureCanvas();
    if (!work) work = workRef.current = ensureCanvas();

    const cssW = size.w;
    const cssH = size.h;
    const physW = Math.floor(cssW * dpr);
    const physH = Math.floor(cssH * dpr);
    const canvas = canvasRef.current!;
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }
    for (const c of [sharp, mask, hover, work]) {
      if (c.width !== physW || c.height !== physH) {
        c.width = physW;
        c.height = physH;
      }
    }

    const hctx = hover.getContext("2d")!;
    const sctx = sharp.getContext("2d")!;
    const mctx = mask.getContext("2d")!;
    const wctx = work.getContext("2d")!;
    const hoverStrength = hovering ? 1 : 0;

    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, physW, physH);
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.font = font;
    hctx.textBaseline = "alphabetic";
    const cx = ptrRef.current.x;
    const cy = ptrRef.current.y;
    const rx = Math.max(10, revealRx);
    const ry = Math.max(10, revealRy);
    const drawOne = (px: number, py: number, str: number) => {
      hctx.save();
      hctx.translate(px, py);
      const sx = Math.max(rx + edgeFeather, 1);
      const sy = Math.max(ry + edgeFeather, 1);
      hctx.scale(sx, sy);
      const g = hctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      const p = Math.max(0.15, Math.min(1, hoverFalloff));
      const mid = 0.45 + 0.15 * (1 - p);
      g.addColorStop(0, `rgba(255,255,255,${0.99 * str})`);
      g.addColorStop(0.28, `rgba(255,255,255,${0.9 * str})`);
      g.addColorStop(mid, `rgba(255,255,255,${0.48 * str})`);
      g.addColorStop(0.82, `rgba(255,255,255,${0.1 * str})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      hctx.fillStyle = g;
      hctx.beginPath();
      hctx.arc(0, 0, 1, 0, Math.PI * 2);
      hctx.fill();
      hctx.restore();
    };
    drawOne(cx, cy, 1);

    let hitIdx = -1;
    for (const g of glyphs) {
      const gw = hctx.measureText(g.char).width;
      if (cx >= g.x && cx <= g.x + gw && cy >= g.y - fontSizePx * 1.15 && cy <= g.y + fontSizePx * 0.35) {
        hitIdx = g.indexInText;
        break;
      }
    }
    if (hitIdx >= 0) {
      const wr = wordCharRangeAt(displayText, hitIdx);
      if (wr) {
        const [wl, wrIdx] = wr;
        const wordGlyphs = glyphs.filter((g) => g.indexInText >= wl && g.indexInText <= wrIdx);
        let wordW = 0;
        for (const g of wordGlyphs) wordW += hctx.measureText(g.char).width;
        const maxDist = Math.max(56, Math.min(480, wordW * 0.72 + fontSizePx * 2.2));
        for (const g of wordGlyphs) {
          const gw = hctx.measureText(g.char).width;
          const gcx = g.x + gw / 2;
          const gcy = g.y - fontSizePx * 0.25;
          const dist = Math.hypot(cx - gcx, cy - gcy);
          const t = Math.max(0, 1 - dist / maxDist);
          const a = t * t * 0.88;
          if (a < 0.012) continue;
          const r = Math.max(6, fontSizePx * 0.72);
          const grad = hctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, r);
          grad.addColorStop(0, `rgba(255,255,255,${0.7 * a})`);
          grad.addColorStop(0.55, `rgba(255,255,255,${0.26 * a})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          hctx.fillStyle = grad;
          hctx.beginPath();
          hctx.arc(gcx, gcy, r, 0, Math.PI * 2);
          hctx.fill();
        }
      }
    }

    if (hoverStrength < 1) {
      hctx.setTransform(1, 0, 0, 1, 0, 0);
      const img = hctx.getImageData(0, 0, physW, physH);
      for (let i = 3; i < img.data.length; i += 4) {
        img.data[i] = Math.floor(img.data[i]! * hoverStrength);
      }
      hctx.putImageData(img, 0, 0);
    }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, cssW, cssH);
    mctx.font = font;
    mctx.textBaseline = "alphabetic";
    mctx.fillStyle = "#fff";
    for (const g of glyphs) {
      mctx.fillText(g.char, g.x, g.y);
    }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, cssW, cssH);
    sctx.font = font;
    sctx.textBaseline = "alphabetic";
    const hasPxS =
      modelPredProm &&
      modelPredProm.length === displayText.length &&
      modelPredSpread &&
      modelPredSpread.length === displayText.length;
    for (const g of glyphs) {
      const li = charMap[g.indexInText] ?? -1;
      if (li < 0) continue;
      const fromModel = rgbByCharIndex?.[g.indexInText];
      const c = fromModel ?? letterColorsFallback[li];
      if (!c) continue;
      const prom = hasPxS ? clamp01(modelPredProm![g.indexInText] ?? 0.5) : 0.5;
      const spr = hasPxS ? clamp01(modelPredSpread![g.indexInText] ?? 0.5) : 0.5;
      /** Same P/S → render mapping as compact preview editor (values unchanged; mapping only). */
      const vs = visualStyleFromPxS(mapPForRender(prom), mapSForRender(spr), c, fontSizePx);
      sctx.save();
      sctx.globalAlpha = vs.fillAlpha;
      sctx.shadowColor = vs.shadowColor;
      sctx.shadowBlur = vs.shadowBlur;
      sctx.shadowOffsetX = 0;
      sctx.shadowOffsetY = 0;
      sctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      sctx.fillText(g.char, g.x, g.y);
      if (vs.strokeStyle) {
        sctx.shadowBlur = 0;
        sctx.shadowColor = "transparent";
        sctx.strokeStyle = vs.strokeStyle;
        sctx.lineWidth = vs.strokeWidth;
        sctx.lineJoin = "round";
        sctx.miterLimit = 2;
        sctx.strokeText(g.char, g.x, g.y);
      }
      sctx.restore();
    }
    sctx.globalCompositeOperation = "destination-in";
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(mask, 0, 0);
    sctx.globalCompositeOperation = "source-over";

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, physW, physH);
    mctx.filter = `blur(${REVEAL_COLOR_SOFTEN_BLUR_PX}px)`;
    mctx.drawImage(sharp, 0, 0);
    mctx.filter = "none";

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, physW, physH);
    wctx.drawImage(mask, 0, 0);
    wctx.globalCompositeOperation = "destination-in";
    wctx.drawImage(hover, 0, 0);
    wctx.globalCompositeOperation = "source-over";

    main.setTransform(1, 0, 0, 1, 0, 0);
    main.fillStyle = CANVAS_BACKGROUND;
    main.fillRect(0, 0, physW, physH);
    main.setTransform(dpr, 0, 0, dpr, 0, 0);
    main.font = font;
    main.textBaseline = "alphabetic";
    main.fillStyle = BASE_GREY;
    for (const g of glyphs) {
      main.fillText(g.char, g.x, g.y);
    }
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.imageSmoothingEnabled = true;
    main.imageSmoothingQuality = "high";
    main.drawImage(work, 0, 0);

    const grain = ensureGrain(physW, physH);
    if (grain) {
      main.save();
      main.globalCompositeOperation = "overlay";
      main.globalAlpha = MAIN_CANVAS_GRAIN_ALPHA;
      main.drawImage(grain, 0, 0);
      main.globalAlpha = 1;
      main.globalCompositeOperation = "source-over";
      main.restore();
    }

    /** Review: keep model-colored word visible even when the spotlight is elsewhere. */
    if (selectedSpan && reviewMode !== "preview") {
      const hasPxSOverlay =
        modelPredProm &&
        modelPredProm.length === displayText.length &&
        modelPredSpread &&
        modelPredSpread.length === displayText.length;
      main.setTransform(dpr, 0, 0, dpr, 0, 0);
      main.font = font;
      main.textBaseline = "alphabetic";
      main.globalCompositeOperation = "source-over";
      for (const g of glyphs) {
        if (g.indexInText < selectedSpan.start || g.indexInText > selectedSpan.end) continue;
        const li = charMap[g.indexInText] ?? -1;
        if (li < 0) continue;
        const fromModel = rgbByCharIndex?.[g.indexInText];
        const c = fromModel ?? letterColorsFallback[li];
        if (!c) continue;
        const prom = hasPxSOverlay ? clamp01(modelPredProm![g.indexInText] ?? 0.5) : 0.5;
        const spr = hasPxSOverlay ? clamp01(modelPredSpread![g.indexInText] ?? 0.5) : 0.5;
        const vs = visualStyleFromPxS(mapPForRender(prom), mapSForRender(spr), c, fontSizePx);
        main.save();
        main.globalAlpha = Math.min(1, vs.fillAlpha * 0.9);
        main.shadowColor = vs.shadowColor;
        main.shadowBlur = vs.shadowBlur;
        main.shadowOffsetX = 0;
        main.shadowOffsetY = 0;
        main.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        main.fillText(g.char, g.x, g.y);
        if (vs.strokeStyle) {
          main.shadowBlur = 0;
          main.shadowColor = "transparent";
          main.strokeStyle = vs.strokeStyle;
          main.lineWidth = vs.strokeWidth;
          main.lineJoin = "round";
          main.miterLimit = 2;
          main.strokeText(g.char, g.x, g.y);
        }
        main.restore();
      }
      main.globalAlpha = 1;
      main.setTransform(1, 0, 0, 1, 0, 0);
    }

    if (selectedSpan) {
      const bb = spanPixelBounds(glyphs, selectedSpan.start, selectedSpan.end, measureForHit, fontSizePx);
      if (bb) {
        main.setTransform(dpr, 0, 0, dpr, 0, 0);
        main.setLineDash([]);
        const pad = 3;
        const letterMode =
          selectedSpan.clickMode === "letter" &&
          selectedSpan.focusCharIndex != null &&
          selectedSpan.focusCharIndex >= selectedSpan.start &&
          selectedSpan.focusCharIndex <= selectedSpan.end;
        if (letterMode) {
          main.strokeStyle = "rgba(59, 130, 246, 0.4)";
          main.lineWidth = 1;
          main.strokeRect(bb.minX - pad, bb.minY - pad, bb.maxX - bb.minX + pad * 2, bb.maxY - bb.minY + pad * 2);
          const fi = selectedSpan.focusCharIndex!;
          const lb = spanPixelBounds(glyphs, fi, fi, measureForHit, fontSizePx);
          if (lb) {
            main.strokeStyle = "rgba(37, 99, 235, 0.95)";
            main.lineWidth = 2;
            main.strokeRect(lb.minX - 2, lb.minY - 2, lb.maxX - lb.minX + 4, lb.maxY - lb.minY + 4);
          }
        } else {
          main.strokeStyle = "rgba(37, 99, 235, 0.9)";
          main.lineWidth = 2;
          main.strokeRect(bb.minX - pad, bb.minY - pad, bb.maxX - bb.minX + pad * 2, bb.maxY - bb.minY + pad * 2);
        }
        main.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }, [
    glyphs,
    charMap,
    rgbByCharIndex,
    letterColorsFallback,
    font,
    size.w,
    size.h,
    dpr,
    hovering,
    revealRx,
    revealRy,
    edgeFeather,
    hoverFalloff,
    displayText,
    fontSizePx,
    selectedSpan,
    measureForHit,
    modelPredProm,
    modelPredSpread,
    ensureGrain,
    reviewMode,
    charMap,
  ]);

  const drawFrameRef = useRef(drawFrame);
  drawFrameRef.current = drawFrame;

  const startFollow = useCallback(() => {
    const step = () => {
      const t = targetPtrRef.current;
      const s = ptrRef.current;
      s.x += (t.x - s.x) * POINTER_SMOOTH;
      s.y += (t.y - s.y) * POINTER_SMOOTH;
      drawFrameRef.current();
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      if (dx * dx + dy * dy > 0.06) {
        followRafRef.current = requestAnimationFrame(step);
      } else {
        followRafRef.current = null;
      }
    };
    followRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      const w = c ? c.clientWidth : el.clientWidth;
      const h = c ? c.clientHeight : el.clientHeight;
      setSize({ w: Math.max(1, w), h: Math.max(1, h) });
      setDpr(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    });
    ro.observe(el);
    if (canvasRef.current) ro.observe(canvasRef.current);
    setSize({
      w: Math.max(1, canvasRef.current?.clientWidth || el.clientWidth),
      h: Math.max(1, canvasRef.current?.clientHeight || el.clientHeight),
    });
    setDpr(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current);
    };
  }, []);

  useEffect(() => {
    drawFrame();
  }, [drawFrame]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const handlePointerPickWord = useCallback(
    (clientX: number, clientY: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const idx = hitTestGlyphIndex(glyphs, x, y, font, fontSizePx, measureForHit);
      if (idx < 0) {
        setSelectedSpan(null);
        return;
      }
      const wr = wordCharRangeAt(displayText, idx);
      if (!wr) {
        setSelectedSpan(null);
        return;
      }
      const [start, end] = wr;
      const wspan = findWordSpanAtCharIndex(displayText, idx);
      const ch = displayText[idx] ?? "";
      const isLetter = /\p{L}/u.test(ch);
      if (spanClickMode === "letter" && !isLetter) {
        setSelectedSpan(null);
        return;
      }
      setSelectedSpan({
        start,
        end,
        selectedText: displayText.slice(start, end + 1),
        tokenIndex: wspan?.tokenIndex,
        clickMode: spanClickMode,
        focusCharIndex: spanClickMode === "letter" && isLetter ? idx : null,
      });
    },
    [glyphs, displayText, font, fontSizePx, measureForHit, spanClickMode]
  );

  const updateHoverTip = useCallback(
    (clientX: number, clientY: number) => {
      if (reviewMode === "preview") {
        setHoverTip(null);
        return;
      }
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const idx = hitTestGlyphIndex(glyphs, x, y, font, fontSizePx, measureForHit);
      if (idx < 0) {
        setHoverTip(null);
        return;
      }
      const wr = wordCharRangeAt(displayText, idx);
      if (!wr) {
        setHoverTip(null);
        return;
      }
      const [start, end] = wr;
      const wordText = displayText.slice(start, end + 1);
      const ps = pxSForCharIndex(idx, displayText.length, modelPredProm, modelPredSpread);
      if (spanClickMode === "letter") {
        const hx = hexForCharIndex(displayText, idx, rgbByCharIndex, letterColorsFallback, charMap);
        const ch = displayText[idx] ?? "";
        setHoverTip({
          x: clientX - r.left,
          y: clientY - r.top,
          text: ch || wordText,
          hex: hx ?? "—",
          prominence: ps?.prominence,
          spread: ps?.spread,
        });
      } else {
        const avg = averageRgbForSpan(displayText, start, end, rgbByCharIndex, letterColorsFallback, charMap);
        setHoverTip({
          x: clientX - r.left,
          y: clientY - r.top,
          text: wordText,
          hex: avg?.hex ?? "—",
          prominence: ps?.prominence,
          spread: ps?.spread,
        });
      }
    },
    [
      reviewMode,
      spanClickMode,
      glyphs,
      displayText,
      font,
      fontSizePx,
      measureForHit,
      rgbByCharIndex,
      letterColorsFallback,
      charMap,
      modelPredProm,
      modelPredSpread,
    ]
  );

  const handleSaveFeedback = useCallback(
    async (saveMode: SaveMode, feedback: FeedbackPayload) => {
      if (!selectedSpan) return;
      const predHex = predictedForSelection?.hex ?? "#888888";
      const pxAvg =
        selectedSpan && modelPredProm && modelPredSpread
          ? averagePxSForLettersInSpan(
              displayText,
              selectedSpan.start,
              selectedSpan.end,
              charMap,
              modelPredProm,
              modelPredSpread
            )
          : null;
      const record: Omit<ModelFeedbackRecord, "id" | "createdAt" | "updatedAt"> = {
        checkpointId: checkpointKey,
        text: displayText,
        selectedSpan,
        prediction: {
          predictedColor: { space: "hex", value: predHex },
          predictedProminence: pxAvg?.prominence,
          predictedSpread: pxAvg?.spread,
          letterPredictions: letterPredictionsForSelection,
          revealRadiusX: revealRx,
          revealRadiusY: revealRy,
          edgeFeather,
          hoverFalloff,
        },
        feedback,
      };
      const saved = await postReviewFeedback(record);
      setSavedRecords((prev) => {
        const rest = prev.filter(
          (p) =>
            !(
              p.text === displayText &&
              p.selectedSpan.start === selectedSpan.start &&
              p.selectedSpan.end === selectedSpan.end
            )
        );
        return [saved, ...rest];
      });

      if (upsertToStimuli) {
        try {
          const word = (selectedSpan.selectedText || "").trim();
          if (word) {
            const up = await upsertStimuliFromEvaluation({
              text: word,
              datasetId: upsertDatasetId || null,
              checkpointId: checkpointKey || null,
              saveMode,
              reviewOutcome: feedback.reviewOutcome,
              language: "en",
            });
            setToast(`Feedback saved · stimuli +${up.created} / existed ${up.existing}`);
          } else {
            setToast("Feedback saved");
          }
        } catch (e) {
          setToast(`Feedback saved · upsert failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        setToast("Feedback saved");
      }
    },
    [
      selectedSpan,
      predictedForSelection,
      letterPredictionsForSelection,
      checkpointKey,
      displayText,
      charMap,
      modelPredProm,
      modelPredSpread,
      revealRx,
      revealRy,
      edgeFeather,
      hoverFalloff,
      upsertToStimuli,
      upsertDatasetId,
    ]
  );

  const toggleReportCheckpoint = useCallback((id: string) => {
    setReportCheckpointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const runCheckpointReport = useCallback(async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const rep = await fetchCheckpointComparisonReport(reportCheckpointIds, 1);
      setReportRows(rep.rows);
      if (rep.rows.length === 0) {
        setReportError("当前选择没有可用评估记录。");
      }
    } catch (e) {
      setReportRows([]);
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setReportLoading(false);
    }
  }, [reportCheckpointIds]);

  const canvasCursor = reviewMode === "preview" ? "cursor-crosshair" : "cursor-pointer";

  return (
    <div className="relative flex h-screen min-h-[480px] w-full flex-col bg-[#f5f7fb]">
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-wrap gap-2">
        <Link
          href="/"
          className="pointer-events-auto rounded-full border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 shadow-sm hover:bg-zinc-800"
        >
          ← Home
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={containerRef}
          className="relative min-h-[55vh] min-w-0 flex-1"
        >
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 z-[5] touch-none ${canvasCursor}`}
            style={{ width: "100%", height: "100%" }}
            onPointerDown={(e) => {
              if (reviewMode === "preview") return;
              e.currentTarget.setPointerCapture(e.pointerId);
              handlePointerPickWord(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              const c = canvasRef.current;
              if (!c) return;
              const r = c.getBoundingClientRect();
              targetPtrRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
              setHovering(true);
              syncModelReadout(e.clientX, e.clientY);
              if (reviewMode !== "preview") updateHoverTip(e.clientX, e.clientY);
              else setHoverTip(null);
              if (followRafRef.current === null) startFollow();
            }}
            onPointerLeave={() => {
              setHovering(false);
              setHoverTip(null);
              setModelReadout(null);
              if (followRafRef.current != null) {
                cancelAnimationFrame(followRafRef.current);
                followRafRef.current = null;
              }
              drawFrame();
            }}
            onPointerEnter={(e) => {
              const c = canvasRef.current;
              if (!c) return;
              const r = c.getBoundingClientRect();
              const x = e.clientX - r.left;
              const y = e.clientY - r.top;
              targetPtrRef.current = { x, y };
              ptrRef.current = { x, y };
              setHovering(true);
              syncModelReadout(e.clientX, e.clientY);
              drawFrame();
            }}
          />
          {hoverTip && reviewMode !== "preview" && (
            <div
              className="pointer-events-none absolute z-[8] max-w-xs rounded border border-zinc-600 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 shadow-md"
              style={{
                left: Math.min(size.w - 160, hoverTip.x + 12),
                top: Math.min(size.h - 48, hoverTip.y + 12),
              }}
            >
              <div>
                <span className="font-mono">{hoverTip.text}</span>
                <span className="ml-2 text-zinc-500">{hoverTip.hex}</span>
              </div>
              {hoverTip.prominence != null && hoverTip.spread != null && (
                <div className="mt-0.5 text-[9px] text-zinc-500">
                  P {hoverTip.prominence.toFixed(3)} · S {hoverTip.spread.toFixed(3)}
                </div>
              )}
            </div>
          )}
          {reviewMode !== "preview" && selectedSpan && selectedSpanBox && (
            <div
              className="pointer-events-auto absolute z-[12]"
              style={{
                left: Math.min(size.w - 190, Math.max(8, selectedSpanBox.maxX + 8)),
                top: Math.max(8, selectedSpanBox.minY - 34),
              }}
            >
              <WordEvaluateEntry
                span={selectedSpan}
                onOpen={() => setIsEvaluateModalOpen(true)}
              />
            </div>
          )}
        </div>

      <aside className="pointer-events-auto max-h-[42vh] w-full overflow-y-auto bg-white/88 p-4 text-sm text-zinc-800 shadow-lg backdrop-blur lg:max-h-none lg:h-full lg:w-[22rem]">
        <h2 className="font-semibold text-zinc-900">Text reveal</h2>
        <p className="mt-1 text-xs text-zinc-500">
          白底便于观察模型颜色。光斑带轻微拖拽跟随；悬停在某词上时整词渐亮，光标附近最鲜明。
        </p>
        <details className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-2 text-violet-950">
          <summary className="cursor-pointer select-none text-xs font-semibold text-violet-900">
            Model runtime（部署验证 · BiLSTM）
          </summary>
          <p className="mt-1.5 text-[10px] leading-snug text-violet-900/80">
            在清单中选 stable checkpoint 时可切 PyTorch / ONNX，与「训练快照」二选一。未选 stable 时仍用下方快照或默认
            champion。
          </p>
          <label className="mt-2 block text-[11px] text-violet-800">
            Stable checkpoint
            <select
              value={selectedStableId}
              onChange={(e) => setSelectedStableId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-zinc-900"
            >
              <option value="">（不用清单，走下方训练快照 / 默认）</option>
              {stableOptions.map((c) => (
                <option key={c.checkpoint_id} value={c.checkpoint_id}>
                  {c.checkpoint_id}
                  {c.pytorch_available ? "" : " · 无 .pt"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-[11px] text-violet-800">
            Inference backend
            <select
              value={inferenceBackend}
              onChange={(e) => setInferenceBackend(e.target.value as "pytorch" | "onnx")}
              disabled={!selectedStableId}
              className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:opacity-50"
            >
              <option value="pytorch">PyTorch</option>
              <option value="onnx">ONNX Runtime</option>
            </select>
          </label>
          {selectedStable && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
              <span
                className={`rounded px-1.5 py-0.5 ${
                  selectedStable.has_onnx ? "bg-emerald-200 text-emerald-950" : "bg-amber-100 text-amber-950"
                }`}
              >
                ONNX: {selectedStable.has_onnx ? "yes" : "no"}
              </span>
              <span className="rounded bg-white/90 px-1.5 py-0.5 text-violet-950 ring-1 ring-violet-200">
                Parity: {selectedStable.parity_status}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 ${
                  selectedStable.pytorch_available ? "bg-sky-100 text-sky-950" : "bg-red-100 text-red-900"
                }`}
              >
                PyTorch: {selectedStable.pytorch_available ? "ok" : "missing"}
              </span>
            </div>
          )}
          {stableOptions.length === 0 && (
            <p className="mt-1 text-[10px] text-amber-900">
              清单中暂无 is_stable 条目。请编辑{" "}
              <code className="rounded bg-white/80 px-0.5">configs/letter_sequence/stable_checkpoints.json</code>{" "}
              并指向真实 .pt / onnx。
            </p>
          )}
        </details>
        <label className="mt-3 block text-[11px] text-zinc-500">
          训练快照 checkpoint
          <select
            value={selectedSnapshotId}
            onChange={(e) => setSelectedSnapshotId(e.target.value)}
            disabled={Boolean(selectedStableId)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">默认（环境变量 LETTER_SEQUENCE_CHECKPOINT / 最新快照）</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id.slice(0, 8)}
                {s.best_val_loss != null ? ` · val ${s.best_val_loss.toFixed(4)}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] text-zinc-400">
            {selectedStableId ? "已选用 stable 清单，此项已忽略" : "仅显示最近 10 个快照"}
          </span>
        </label>
        <button
          type="button"
          onClick={() => void applyModelColors()}
          disabled={modelLoading}
          className="mt-2 w-full rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
        >
          {modelLoading ? "计算中…" : "计算模型颜色"}
        </button>
        {modelMessage && (
          <p className="mt-2 text-[11px] leading-snug text-zinc-600">{modelMessage}</p>
        )}
        {modelReadout && (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 text-[11px] text-violet-950">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-800">Model under cursor</div>
            <div className="mt-1 font-mono text-zinc-900">
              {modelReadout.ch} · {modelReadout.hex}
            </div>
            <div className="mt-1 font-mono text-[10px] text-zinc-700">
              prominence {modelReadout.prominence.toFixed(3)} · spread {modelReadout.spread.toFixed(3)}
            </div>
            <p className="mt-1 text-[9px] leading-snug text-violet-900/80">
              Same heads as letter-sequence training (not the reveal spotlight sliders below). The canvas maps P→
              opacity & stroke weight, S→ colored glow — together with Lab color.
            </p>
          </div>
        )}
        <label className="mt-3 block text-[11px] text-zinc-500">
          Text
          <textarea
            value={displayText}
            onChange={(e) => setDisplayText(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs text-zinc-900"
          />
        </label>
        <label className="mt-3 block text-[11px] text-zinc-500">
          revealRadiusX ({Math.round(revealRx)}px)
          <input
            type="range"
            min={20}
            max={280}
            value={revealRx}
            onChange={(e) => setRevealRx(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="mt-2 block text-[11px] text-zinc-500">
          revealRadiusY ({Math.round(revealRy)}px)
          <input
            type="range"
            min={20}
            max={200}
            value={revealRy}
            onChange={(e) => setRevealRy(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="mt-2 block text-[11px] text-zinc-500">
          edgeFeather ({Math.round(edgeFeather)}px)
          <input
            type="range"
            min={0}
            max={80}
            value={edgeFeather}
            onChange={(e) => setEdgeFeather(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="mt-2 block text-[11px] text-zinc-500">
          hoverFalloff ({hoverFalloff.toFixed(2)})
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.05}
            value={hoverFalloff}
            onChange={(e) => setHoverFalloff(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <div className="my-4 border-t border-zinc-200" />

        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Review</h3>
        <div className="mt-2 space-y-3">
          <ReviewModeToggle value={reviewMode} onChange={setReviewMode} />
          {reviewMode !== "preview" && (
            <ReviewClickModeToggle value={spanClickMode} onChange={setSpanClickMode} />
          )}
          {reviewMode !== "preview" && (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
              <label className="flex items-center gap-2 text-[11px] text-zinc-700">
                <input
                  type="checkbox"
                  checked={upsertToStimuli}
                  onChange={(e) => setUpsertToStimuli(e.target.checked)}
                />
                Evaluation 保存时 upsert 到 stimuli（可关）
              </label>
              {upsertToStimuli && (
                <label className="block text-[10px] text-zinc-500">
                  目标数据集
                  <select
                    value={upsertDatasetId}
                    onChange={(e) => setUpsertDatasetId(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900"
                  >
                    {datasets.length === 0 && <option value="">(No dataset)</option>}
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {feedbackLoading && <p className="text-[10px] text-zinc-400">Loading saved feedback…</p>}
          <SelectedSpanInfo
            span={selectedSpan}
            predictedHex={predictedForSelection?.hex ?? null}
            avgProminence={avgPxSForSelection?.prominence ?? null}
            avgSpread={avgPxSForSelection?.spread ?? null}
            letterPredictions={letterPredictionsForSelection}
            hasSavedFeedback={!!existingForSpan}
          />
          {reviewMode !== "preview" && (
            <WordEvaluateEntry
              span={selectedSpan}
              disabled={!selectedSpan}
              onOpen={() => setIsEvaluateModalOpen(true)}
            />
          )}
          {reviewMode === "preview" && <p className="text-[11px] text-zinc-500">Switch to Evaluate to log feedback on words.</p>}
        </div>

        <div className="my-4 border-t border-zinc-200" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Checkpoint Compare Report</h3>
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-zinc-500">选择要对比的 checkpoint（支持 BiLSTM / MLP / Transformer 混合）。</p>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
            {snapshots.length === 0 ? (
              <p className="text-[10px] text-zinc-400">No snapshots</p>
            ) : (
              snapshots.map((s) => (
                <label key={`rep-${s.id}`} className="flex items-center gap-2 text-[11px] text-zinc-700">
                  <input
                    type="checkbox"
                    checked={reportCheckpointIds.includes(s.id)}
                    onChange={() => toggleReportCheckpoint(s.id)}
                  />
                  <span className="truncate">
                    {s.name || s.id.slice(0, 8)}
                    {s.best_val_loss != null ? ` · val ${s.best_val_loss.toFixed(4)}` : ""}
                  </span>
                </label>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => void runCheckpointReport()}
            disabled={reportLoading}
            className="w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
          >
            {reportLoading ? "生成中..." : "生成对比报表（百分制）"}
          </button>
          {reportError && <p className="text-[10px] text-red-600">{reportError}</p>}
          {reportRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-full text-left text-[10px]">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-2 py-1">Model</th>
                    <th className="px-2 py-1">Family</th>
                    <th className="px-2 py-1">Reviews</th>
                    <th className="px-2 py-1">Accept</th>
                    <th className="px-2 py-1">Reject</th>
                    <th className="px-2 py-1">Best val</th>
                    <th className="px-2 py-1">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((r) => (
                    <tr key={`rr-${r.checkpoint_id}`} className="border-t border-zinc-100">
                      <td className="px-2 py-1 font-mono">{r.snapshot_name || r.checkpoint_id.slice(0, 8)}</td>
                      <td className="px-2 py-1">{r.model_family || "—"}</td>
                      <td className="px-2 py-1 tabular-nums">{r.n_reviews}</td>
                      <td className="px-2 py-1 tabular-nums">{(r.accept_rate * 100).toFixed(1)}%</td>
                      <td className="px-2 py-1 tabular-nums">{(r.reject_rate * 100).toFixed(1)}%</td>
                      <td className="px-2 py-1 tabular-nums">
                        {r.best_val_loss != null ? r.best_val_loss.toFixed(4) : "—"}
                      </td>
                      <td className="px-2 py-1 tabular-nums font-semibold text-indigo-700">
                        {r.final_score_100.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
      <EvaluateWordModal
        open={isEvaluateModalOpen && reviewMode !== "preview"}
        span={selectedSpan}
        predictedHex={predictedForSelection?.hex ?? "#cccccc"}
        avgProminence={avgPxSForSelection?.prominence ?? null}
        avgSpread={avgPxSForSelection?.spread ?? null}
        letterPredictions={letterPredictionsForSelection}
        reviewMode={reviewMode}
        onClose={() => setIsEvaluateModalOpen(false)}
        onSave={handleSaveFeedback}
      />
    </div>
    </div>
  );
}
