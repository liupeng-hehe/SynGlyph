"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QUALITATIVE_TAGS,
  type Confidence,
  type ErrorType,
  type FeedbackPayload,
  type LetterColorCorrectionEntry,
  type LetterPredictionEntry,
  type ReviewMode,
  type ReviewOutcome,
  type SaveMode,
  type SelectedSpanPayload,
  type Severity,
} from "@/lib/modelFeedbackTypes";
import { inferReviewErrorType, inferWordOnlyErrorType, spanSessionKey } from "@/lib/inferReviewErrorType";
import { ColorCorrectionPicker } from "@/components/text-reveal/ColorCorrectionPicker";
import type { MigrationLeanByLeftIndex } from "@/components/text-reveal/LetterBoundaryMigrationEval";
import { computeWordAnnotationReviewScore } from "@/lib/wordAnnotationReviewScore";
import { WordReviewScorePanel } from "@/components/text-reveal/WordReviewScorePanel";
import { hexToRgb, punchRgbForDisplay } from "@/lib/textRevealCanvasUtils";
import { mapPForRender, mapSForRender } from "@/lib/textRevealPreviewEditorMap";
import { visualStyleFromPxS } from "@/lib/textRevealPxSVisual";
import { BoundaryAxis, SegmentColumn } from "@/components/english/AnnotateGlyphControls";
import { editsRowPreviewRgb } from "@/lib/letterMigrationPreviewRgb";

const OUTCOMES: { id: ReviewOutcome; label: string }[] = [
  { id: "accept", label: "Accept as-is" },
  { id: "minor_edit", label: "Accept with minor edits" },
  { id: "reject", label: "Reject" },
];

const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  wrong_color: "Wrong color",
  wrong_span: "Wrong span/range",
  wrong_intensity: "Wrong intensity",
  wrong_boundary_transition: "Wrong boundary/transition",
  other: "Other",
};

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: "minor", label: "Minor" },
  { id: "medium", label: "Medium" },
  { id: "major", label: "Major" },
];

const CONFIDENCES: { id: Confidence; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

function needsErrorType(outcome: ReviewOutcome): boolean {
  return outcome === "minor_edit" || outcome === "reject";
}

function attachLetterBoundaryMigration(
  fb: FeedbackPayload,
  reviewMode: ReviewMode,
  outcome: ReviewOutcome,
  letterPredictions: LetterPredictionEntry[],
  migrationEval: MigrationLeanByLeftIndex
) {
  if (reviewMode !== "evaluate" || outcome !== "minor_edit" || letterPredictions.length < 2) return;
  fb.letterBoundaryMigrationEval = letterPredictions.slice(0, -1).map((left, i) => ({
    leftCharIndex: left.charIndex,
    rightCharIndex: letterPredictions[i + 1]!.charIndex,
    lean: migrationEval[left.charIndex]?.lean ?? 0,
  }));
}

function hexNorm(h: string): string {
  const s = h.trim();
  const x = s.startsWith("#") ? s : `#${s}`;
  return x.toLowerCase();
}

function averageHexFromStrings(hexes: string[]): string {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (const h of hexes) {
    const x = hexNorm(h).replace("#", "");
    if (x.length !== 6) continue;
    r += parseInt(x.slice(0, 2), 16);
    g += parseInt(x.slice(2, 4), 16);
    b += parseInt(x.slice(4, 6), 16);
    n++;
  }
  if (n === 0) return "#888888";
  const R = Math.round(r / n),
    G = Math.round(g / n),
    B = Math.round(b / n);
  const p = (v: number) => v.toString(16).padStart(2, "0");
  return `#${p(R)}${p(G)}${p(B)}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampLean11(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

export function FeedbackForm({
  selectedSpan,
  predictedHex,
  letterPredictions,
  focusCharIndex,
  reviewMode,
  onSave,
  disabled,
}: {
  selectedSpan: SelectedSpanPayload | null;
  predictedHex: string;
  letterPredictions: LetterPredictionEntry[];
  focusCharIndex?: number | null;
  reviewMode: ReviewMode;
  onSave: (saveMode: SaveMode, feedback: FeedbackPayload) => Promise<void>;
  disabled?: boolean;
}) {
  const [outcome, setOutcome] = useState<ReviewOutcome>("accept");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [notes, setNotes] = useState("");
  const [correctedHex, setCorrectedHex] = useState("#888888");
  const [letterEdits, setLetterEdits] = useState<Record<number, string>>({});
  const [letterPromEdits, setLetterPromEdits] = useState<Record<number, number>>({});
  const [letterSprEdits, setLetterSprEdits] = useState<Record<number, number>>({});
  const [qualTags, setQualTags] = useState<Set<string>>(new Set());
  const [migrationEval, setMigrationEval] = useState<MigrationLeanByLeftIndex>({});
  const [saving, setSaving] = useState(false);
  const saveFeedbackRef = useRef<() => void>(() => {});
  /** Baseline span for the current “word session” (see spanSessionKey); drift ⇒ wrong_span. */
  const spanSessionKeyRef = useRef<string>("");
  const spanBaselineRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    setOutcome("accept");
    setSeverity("medium");
    setConfidence("medium");
    setNotes("");
    setCorrectedHex(predictedHex || "#888888");
    setQualTags(new Set());
  }, [selectedSpan?.start, selectedSpan?.end, predictedHex]);

  useEffect(() => {
    const ce: Record<number, string> = {};
    const pe: Record<number, number> = {};
    const se: Record<number, number> = {};
    for (const r of letterPredictions) {
      ce[r.charIndex] = r.hex;
      pe[r.charIndex] = r.prominence;
      se[r.charIndex] = r.spread;
    }
    setLetterEdits(ce);
    setLetterPromEdits(pe);
    setLetterSprEdits(se);
  }, [letterPredictions]);

  /** Migration UI only under Evaluate + minor edits; reset when switching away. */
  useEffect(() => {
    if (outcome !== "minor_edit" || letterPredictions.length < 2) {
      setMigrationEval({});
      return;
    }
    setMigrationEval((prev) => {
      const next: MigrationLeanByLeftIndex = {};
      for (let i = 0; i < letterPredictions.length - 1; i++) {
        const k = letterPredictions[i]!.charIndex;
        next[k] = prev[k] !== undefined ? prev[k]! : { lean: 0 };
      }
      return next;
    });
  }, [outcome, letterPredictions]);

  if (selectedSpan) {
    const k = spanSessionKey(selectedSpan);
    if (k !== spanSessionKeyRef.current) {
      spanSessionKeyRef.current = k;
      spanBaselineRef.current = { start: selectedSpan.start, end: selectedSpan.end };
    }
  } else {
    spanSessionKeyRef.current = "";
    spanBaselineRef.current = null;
  }

  const toggleTag = useCallback((t: string) => {
    setQualTags((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  }, []);

  const buildFeedback = useCallback(
    (saveMode: SaveMode): FeedbackPayload | null => {
      if (!selectedSpan) return null;

      if (!needsErrorType(outcome)) {
        const fb: FeedbackPayload = {
          reviewOutcome: outcome,
          severity,
          confidence,
          notes: notes.trim() || undefined,
          saveMode,
        };
        attachLetterBoundaryMigration(fb, reviewMode, outcome, letterPredictions, migrationEval);
        return fb;
      }

      const et: ErrorType =
        letterPredictions.length >= 1
          ? inferReviewErrorType(
              spanBaselineRef.current,
              selectedSpan,
              letterPredictions,
              letterEdits,
              letterPromEdits,
              letterSprEdits
            )
          : inferWordOnlyErrorType(predictedHex, correctedHex);

      const fb: FeedbackPayload = {
        reviewOutcome: outcome,
        errorType: et,
        severity,
        confidence,
        notes: notes.trim() || undefined,
        saveMode,
      };

      const letterGrid =
        letterPredictions.length >= 1 &&
        (et === "wrong_color" || et === "wrong_intensity" || et === "wrong_span");

      if (letterGrid) {
        const lockColor = et === "wrong_intensity";
        const entries: LetterColorCorrectionEntry[] = letterPredictions.map((r) => ({
          charIndex: r.charIndex,
          char: r.char,
          predictedColor: { space: "hex", value: r.hex },
          correctedColor: {
            space: "hex",
            value: lockColor ? r.hex : (letterEdits[r.charIndex] ?? r.hex),
          },
          predictedProminence: r.prominence,
          predictedSpread: r.spread,
          correctedProminence: letterPromEdits[r.charIndex] ?? r.prominence,
          correctedSpread: letterSprEdits[r.charIndex] ?? r.spread,
        }));
        fb.letterColorCorrections = entries;
        if (et === "wrong_color") {
          if (qualTags.size) fb.qualitativeTags = Array.from(qualTags);
          const correctedList = entries.map((e) => e.correctedColor.value as string);
          fb.correctedColor = { space: "hex", value: averageHexFromStrings(correctedList) };
        }
        attachLetterBoundaryMigration(fb, reviewMode, outcome, letterPredictions, migrationEval);
        return fb;
      }

      if (et === "wrong_color") {
        if (qualTags.size) fb.qualitativeTags = Array.from(qualTags);
        fb.correctedColor = { space: "hex", value: correctedHex };
      }

      attachLetterBoundaryMigration(fb, reviewMode, outcome, letterPredictions, migrationEval);
      return fb;
    },
    [
      selectedSpan,
      outcome,
      severity,
      confidence,
      notes,
      correctedHex,
      qualTags,
      letterPredictions,
      letterEdits,
      letterPromEdits,
      letterSprEdits,
      predictedHex,
      reviewMode,
      migrationEval,
    ]
  );

  const runSave = useCallback(
    async (saveMode: SaveMode) => {
      const fb = buildFeedback(saveMode);
      if (!fb) {
        window.alert("Could not build feedback.");
        return;
      }
      setSaving(true);
      try {
        await onSave(saveMode, fb);
      } finally {
        setSaving(false);
      }
    },
    [buildFeedback, onSave]
  );

  useEffect(() => {
    saveFeedbackRef.current = () => {
      void runSave("feedback");
    };
  }, [runSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!selectedSpan) return;
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        setOutcome("accept");
      } else if (k === "m") {
        e.preventDefault();
        setOutcome("minor_edit");
      } else if (k === "r" && !e.shiftKey) {
        e.preventDefault();
        setOutcome("reject");
      } else if (k === "s") {
        e.preventDefault();
        saveFeedbackRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSpan]);

  const showLetterParamGrid = letterPredictions.length >= 1;
  const showWordOnlyPicker = needsErrorType(outcome) && letterPredictions.length === 0;

  const inferredErrorType: ErrorType | null =
    selectedSpan && needsErrorType(outcome)
      ? letterPredictions.length >= 1
        ? inferReviewErrorType(
            spanBaselineRef.current,
            selectedSpan,
            letterPredictions,
            letterEdits,
            letterPromEdits,
            letterSprEdits
          )
        : inferWordOnlyErrorType(predictedHex, correctedHex)
      : null;

  const inferredLabel = inferredErrorType ? ERROR_TYPE_LABELS[inferredErrorType] : null;
  const showColorEdit = inferredErrorType !== "wrong_intensity";
  const reviewScore = useMemo(
    () =>
      computeWordAnnotationReviewScore({
        rows: letterPredictions,
        colorEdits: letterEdits,
        promEdits: letterPromEdits,
        sprEdits: letterSprEdits,
        migrationEval,
      }),
    [letterPredictions, letterEdits, letterPromEdits, letterSprEdits, migrationEval]
  );

  if (!selectedSpan) {
    return (
      <p className="text-[11px] text-zinc-500">Select a word to enable feedback.</p>
    );
  }

  return (
    <div className="space-y-3 text-[11px]">
      <div>
        <span className="text-[10px] font-medium text-zinc-600">Review outcome</span>
        <div className="mt-1 space-y-1">
          {OUTCOMES.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="outcome"
                checked={outcome === o.id}
                onChange={() => setOutcome(o.id)}
                disabled={disabled || saving}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      {needsErrorType(outcome) && inferredLabel && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[10px] text-zinc-600">
          <span className="font-medium text-zinc-700">Inferred issue</span>
          <span className="ml-1.5 text-zinc-900">{inferredLabel}</span>
          <span className="mt-1 block text-zinc-500">
            From your edits: span change → wrong span; color change → wrong color; P/S only → wrong intensity; else other.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-zinc-600">Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            disabled={disabled || saving}
          >
            {SEVERITIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-600">Confidence</span>
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as Confidence)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            disabled={disabled || saving}
          >
            {CONFIDENCES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showWordOnlyPicker && (
        <ColorCorrectionPicker
          currentHex={predictedHex}
          correctedHex={correctedHex}
          onCorrectedHexChange={setCorrectedHex}
          tags={qualTags}
          onToggleTag={toggleTag}
        />
      )}

      {showLetterParamGrid && (
        <div className="space-y-3 rounded-lg border border-zinc-900/40 bg-[radial-gradient(circle_at_20%_20%,#2a2544_0%,#181c2e_45%,#131726_100%)] px-3 py-3">
          <div className="rounded-md bg-black/20 px-3 py-3">
            <div className="font-mono text-5xl font-semibold tracking-wide leading-tight text-white">
              {letterPredictions.map((r, i) => {
                const hex = letterEdits[r.charIndex] ?? r.hex;
                const p = clamp01(letterPromEdits[r.charIndex] ?? r.prominence);
                const s = clamp01(letterSprEdits[r.charIndex] ?? r.spread);
                const rgb =
                  reviewMode === "evaluate" && letterPredictions.length >= 2
                    ? editsRowPreviewRgb(letterPredictions, letterEdits, migrationEval, i)
                    : punchRgbForDisplay(hexToRgb(hex), 1.34);
                const vs = visualStyleFromPxS(mapPForRender(p), mapSForRender(s), rgb, 36);
                return (
                  <span key={r.charIndex} className="relative inline-block">
                    {i > 0 && (
                      <span
                        className="pointer-events-none absolute left-0 top-0 flex h-full w-4 -translate-x-1/2 items-center justify-center"
                        aria-hidden
                      >
                        <span className="h-[0.85em] w-px bg-white/45" />
                      </span>
                    )}
                    <span
                      className="inline-block rounded px-0.5"
                      style={{
                        color: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
                        opacity: vs.fillAlpha,
                        textShadow: `0 0 ${vs.shadowBlur}px ${vs.shadowColor}`,
                      }}
                    >
                      {r.char}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-white/50">
            Double-click letter or color swatch to add to background
            <span className="text-white/35"> (preview only in review)</span>
          </p>

          <div className="mb-2 flex flex-wrap items-end justify-center gap-4">
            {letterPredictions.map((r, i) => {
              const n = letterPredictions.length;
              const hex = letterEdits[r.charIndex] ?? r.hex;
              const p = clamp01(letterPromEdits[r.charIndex] ?? r.prominence);
              const s = clamp01(letterSprEdits[r.charIndex] ?? r.spread);
              const left = letterPredictions[i]!;
              const right = letterPredictions[i + 1];
              const showBoundary = reviewMode === "evaluate" && n >= 2 && i < n - 1 && right;
              const lean = clampLean11(migrationEval[left.charIndex]?.lean ?? 0);
              const dValue = (lean + 1) / 2;

              return (
                <Fragment key={r.charIndex}>
                  <SegmentColumn
                    label={`${r.char}`}
                    hex={hex}
                    colorLocked={!showColorEdit}
                    pxsSize={118}
                    onColorChange={(h) => setLetterEdits({ ...letterEdits, [r.charIndex]: h })}
                    onAddToBg={() => {}}
                    prominence={p}
                    spread={s}
                    onPxSChange={(prom, spr) => {
                      setLetterPromEdits({ ...letterPromEdits, [r.charIndex]: prom });
                      setLetterSprEdits({ ...letterSprEdits, [r.charIndex]: spr });
                    }}
                  />
                  {showBoundary && right && (
                    <BoundaryAxis
                      leftHex={letterEdits[left.charIndex] ?? left.hex}
                      rightHex={letterEdits[right.charIndex] ?? right.hex}
                      value={dValue}
                      onChange={(v) =>
                        setMigrationEval({
                          ...migrationEval,
                          [left.charIndex]: { lean: clampLean11(2 * v - 1) },
                        })
                      }
                    />
                  )}
                </Fragment>
              );
            })}
          </div>

          <p className="mb-1 text-[10px] text-white/45">
            P=prominence (halo) · S=spread (opacity/blur) · D=diffusion at letter boundary (Evaluate)
          </p>

          <WordReviewScorePanel result={reviewScore} />
        </div>
      )}

      <p className="text-[10px] text-zinc-400">
        Keyboard (when not typing in a field): A accept · M minor edits · R reject · S save feedback
      </p>

      <div className="flex flex-col gap-1.5 border-t border-zinc-200 pt-3">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void runSave("feedback")}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save feedback"}
        </button>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void runSave("correction_sample")}
          className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
        >
          Save as correction sample
        </button>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void runSave("retraining_queue")}
          className="w-full rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
        >
          Queue for retraining
        </button>
      </div>
    </div>
  );
}
