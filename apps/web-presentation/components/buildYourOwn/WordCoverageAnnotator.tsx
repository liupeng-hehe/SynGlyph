"use client";

/**
 * Per-letter coverage annotation — interaction model ported from
 * apps/web-english/app/annotate/[stimulusId]/page.tsx (per-char segments + SegmentColumn + BoundaryAxis).
 * Visual shell: cream / Klein blue (BYO), not dark GrainientBg.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject, RefObject } from "react";

import {
  annotateWordLetterStyle,
  charColorsForPerCharSegments,
  coveragePreviewGlyphStyles,
  hexWithHash,
  type SegmentLab,
} from "@/lib/annotateCharColors";
import {
  COVERAGE_DEFAULT_PXS,
  COVERAGE_WORD_BACKGROUND,
  canvasCellBackgroundStyle,
  coverageRingOffsetColor,
  wordSpotlightLayers,
} from "@/lib/buildYourOwn/wordContrastBackground";
import { byoLabSwatchIconColor } from "@/lib/colorStudio/byoTheme";
import { clampLab, hexToLab } from "@/lib/labColor";

import { ByoChromaStack } from "./ByoChromaStack";
import { LabBoundaryBar, LabProminenceSpreadPicker } from "./LabPxSControls";

const INK = "#002FA7";

const COVERAGE_INTRO_SESSION_KEY = "synGlyph-byo-coverage-intro-v1";

const CANVAS_GRID_THIRDS = ["33.333%", "50%", "66.667%"] as const;

function CanvasPxSGrid() {
  return (
    <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full" aria-hidden>
      {CANVAS_GRID_THIRDS.map((pos) => (
        <line
          key={`v-${pos}`}
          x1={pos}
          y1="0"
          x2={pos}
          y2="100%"
          stroke={INK}
          strokeOpacity={pos === "50%" ? 0.34 : 0.24}
          strokeWidth={1}
          strokeDasharray={pos === "50%" ? "4 3" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {CANVAS_GRID_THIRDS.map((pos) => (
        <line
          key={`h-${pos}`}
          x1="0"
          y1={pos}
          x2="100%"
          y2={pos}
          stroke={INK}
          strokeOpacity={pos === "50%" ? 0.34 : 0.24}
          strokeWidth={1}
          strokeDasharray={pos === "50%" ? "4 3" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

const BOUNDARY_BAR_W = 48;

const MIN_LEN_TO_SPLIT = 11;

/**
 * Row count is not hard-coded by length brackets: we search 2…maxRows and pick the count whose
 * average letters/row is closest to a soft target (~5.25), with mild penalty for very wide rows.
 * Ties favor fewer rows. Chunks still differ by at most one letter via `balancedBoundaries`.
 */
function rowCountForWord(len: number): number {
  if (len < MIN_LEN_TO_SPLIT) return 1;
  const idealPerRow = 5.25;
  const maxR = Math.min(12, Math.max(2, Math.floor(len / 3)));
  let bestR = 2;
  let bestScore = Infinity;
  for (let r = 2; r <= maxR; r++) {
    const avg = len / r;
    if (avg < 3) continue;
    const dist = Math.abs(avg - idealPerRow);
    const penaltyWide = avg > 7.5 ? (avg - 7.5) * 0.35 : 0;
    const score = dist + penaltyWide;
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && r < bestR)) {
      bestScore = score;
      bestR = r;
    }
  }
  return bestR;
}

/** Split [ws, we) into `numRows` contiguous runs with balanced lengths. */
function balancedBoundaries(ws: number, we: number, numRows: number): number[] {
  const len = we - ws;
  if (numRows <= 1) return [ws, we];
  const out: number[] = [ws];
  let pos = ws;
  const base = Math.floor(len / numRows);
  const rem = len % numRows;
  for (let r = 0; r < numRows - 1; r++) {
    pos += base + (r < rem ? 1 : 0);
    out.push(pos);
  }
  out.push(we);
  return out;
}

/**
 * One row range per visual line of annotator columns. Whitespace-separated words are separate;
 * long words split into multiple balanced rows (row count from a soft density target). Inter-word gaps attach to the
 * row that starts the next word so indices / D-bars stay consistent.
 */
function coverageRowRanges(word: string): { start: number; end: number }[] {
  const w = String(word);
  const n = w.length;
  if (n === 0) return [];

  const words: { s: number; e: number }[] = [];
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(w[i]!)) i++;
    if (i >= n) break;
    const s = i;
    while (i < n && !/\s/.test(w[i]!)) i++;
    words.push({ s, e: i });
  }

  if (words.length === 0) return [{ start: 0, end: n }];

  const rows: { start: number; end: number }[] = [];

  for (let wi = 0; wi < words.length; wi++) {
    const { s: ws, e: we } = words[wi]!;
    const len = we - ws;
    const numRows = rowCountForWord(len);
    const boundaries = numRows > 1 ? balancedBoundaries(ws, we, numRows) : [ws, we];

    for (let k = 0; k < boundaries.length - 1; k++) {
      const a = boundaries[k]!;
      const b = boundaries[k + 1]!;
      const rowStart = k === 0 && wi > 0 ? words[wi - 1]!.e : a;
      rows.push({ start: rowStart, end: b });
    }
  }

  return rows;
}

function WordCoverageIntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes byoIntroStep {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .byo-intro-step { animation: byoIntroStep 0.48s ease-out both; }
        `,
        }}
      />
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: "rgba(0, 47, 167, 0.18)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="byo-coverage-intro-title"
      >
        <div className="max-h-[min(90vh,520px)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#002FA7]/18 bg-[#FFFCF3] p-6 shadow-[0_20px_50px_rgba(0,47,167,0.12)]">
          <h2 id="byo-coverage-intro-title" className="font-display text-lg font-semibold" style={{ color: INK }}>
            Word annotation · quick start
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed opacity-80" style={{ color: INK }}>
            Same P×S / D model as English annotate. Effect preview updates live above; one column per letter below. Use ◎ for LAB,
            drag the canvas for P×S, and D bars between letters (including at line breaks) for boundary blend.
          </p>

          <ol className="mt-5 space-y-4 text-left text-[11px] leading-snug" style={{ color: INK }}>
            <li className="byo-intro-step flex gap-3" style={{ animationDelay: "0.06s" }}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: INK }}
              >
                1
              </span>
              <span>
                <strong className="font-semibold">Select &amp; color</strong> — click a letter in the preview word; tap ◎ on a column to open LAB beside it.
              </span>
            </li>
            <li className="byo-intro-step flex gap-3" style={{ animationDelay: "0.18s" }}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: INK }}
              >
                2
              </span>
              <span>
                <strong className="font-semibold">P×S</strong> — drag on the canvas: up = higher P, right = higher S. Double-click fills the{" "}
                <strong className="font-semibold">entire tile</strong> with the letter color (display only).
              </span>
            </li>
            <li className="byo-intro-step flex gap-3" style={{ animationDelay: "0.3s" }}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: INK }}
              >
                3
              </span>
              <span>
                <strong className="font-semibold">D (diffusion)</strong> — drag the bar between letters to bias the boundary blend; double-click to reset. Long words also show a D bar at the end of a row (before the next line).
              </span>
            </li>
          </ol>

          <button
            type="button"
            onClick={onDismiss}
            className="mt-6 w-full rounded-full py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95"
            style={{ background: INK }}
          >
            Start annotating
          </button>
        </div>
      </div>
    </>
  );
}

function hexCore(h: string): string {
  const x = h.startsWith("#") ? h : `#${h}`;
  return x.length >= 7 ? x.slice(0, 7) : "#57534e";
}

function buildSegmentState(
  word: string,
  profileLetters: ProfileState["letters"],
  indexHex: Record<number, string>,
  indexPxS: Record<number, { prominence: number; spread: number }>,
): { segmentAttrs: SegmentLab[]; charAttrs: Record<number, { prominence: number; spread: number }> } {
  const chars = Array.from(word);
  const charAttrs: Record<number, { prominence: number; spread: number }> = {};
  const segmentAttrs: SegmentLab[] = chars.map((ch, i) => {
    const low = ch.toLowerCase();
    const isLetter = /[a-z]/.test(low);
    const row = isLetter ? profileLetters[low] : undefined;
    const ov = indexPxS[i];
    const prominence = ov?.prominence ?? COVERAGE_DEFAULT_PXS.prominence;
    const spread = ov?.spread ?? COVERAGE_DEFAULT_PXS.spread;

    if (!isLetter) {
      charAttrs[i] = { prominence: 0, spread: 0 };
      return { color_lab: [75, 0, -5], prominence: 0, spread: 0 };
    }
    charAttrs[i] = { prominence, spread };

    let hex = indexHex[i] ?? row?.color ?? "#a8a29e";
    if (!hex.startsWith("#")) hex = `#${hex}`;
    let labTriplet: [number, number, number] = [70, 5, -25];
    try {
      const t = hexToLab(hexCore(hex).replace("#", ""));
      const c = clampLab(t.L, t.a, t.b);
      labTriplet = [c.L, c.a, c.b];
    } catch {
      /* default */
    }
    return { color_lab: labTriplet, prominence, spread };
  });
  return { segmentAttrs, charAttrs };
}

type ProfileState = {
  letters: Record<
    string,
    {
      color: string;
      lab_l: number;
      lab_a: number;
      lab_b: number;
      prominence?: number;
      spread?: number;
    }
  >;
};

type CoverageLabPickerProps = {
  labL: number;
  labA: number;
  labB: number;
  swatchPreview: string;
  lightnessTrackGradient: string;
  planeRef: RefObject<HTMLDivElement>;
  chromaCanvasRef: RefObject<HTMLCanvasElement>;
  dragPlane: MutableRefObject<boolean>;
  onPlaneMouse: (clientX: number, clientY: number) => void;
  syncHexInputsFromNumbers: (L: number, a: number, b: number) => void;
};

type Props = {
  word: string;
  profile: ProfileState;
  indexHex: Record<number, string>;
  indexPxS: Record<number, { prominence: number; spread: number }>;
  onIndexPxSChange: (index: number, prominence: number, spread: number) => void;
  boundaryInfluence: number[];
  onBoundaryInfluenceChange: (boundaryIndex: number, value: number) => void;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  labPickerIndex: number | null;
  onLabPickerToggle: (index: number) => void;
  onCloseLabPicker: () => void;
  labPicker: CoverageLabPickerProps;
  onAddColorToBackground?: (hex: string, letterIndex: number) => void;
  /** Per-letter canvas fills (double-click canvas) — uniform across the whole tile. */
  canvasBgHex?: Record<number, string>;
  /** Page cream — contrast outlines are measured against this (not a fill backdrop). */
  wordBackgroundHex?: string;
  /** Contrast mode: top-light wash + stronger outlines (display-only). */
  contrastBg?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    suggestedHex: string;
    minLContrast: number;
    defaultMinLContrast: number;
  };
};

function CoverageLabPopover({
  letterLabel,
  getAnchor,
  onClose,
  labPicker,
}: {
  letterLabel: string;
  getAnchor: () => HTMLDivElement | null;
  onClose: () => void;
  labPicker: CoverageLabPickerProps;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"right" | "left" | "below">("right");

  useEffect(() => {
    const anchor = getAnchor();
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const update = () => {
      const ar = anchor.getBoundingClientRect();
      const pw = panel.offsetWidth || 280;
      const ph = panel.offsetHeight || 360;
      const margin = 12;
      const spaceRight = window.innerWidth - ar.right;
      const spaceLeft = ar.left;
      const spaceBelow = window.innerHeight - ar.bottom;

      if (spaceRight >= pw + margin) {
        setPlacement("right");
      } else if (spaceLeft >= pw + margin) {
        setPlacement("left");
      } else if (spaceBelow >= ph + margin) {
        setPlacement("below");
      } else {
        setPlacement("right");
      }
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [getAnchor, letterLabel]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const anchor = getAnchor();
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [getAnchor, onClose]);

  const placementClass =
    placement === "right"
      ? "left-[calc(100%+0.65rem)] top-0"
      : placement === "left"
        ? "right-[calc(100%+0.65rem)] top-0"
        : "left-1/2 top-[calc(100%+0.65rem)] -translate-x-1/2";

  return (
    <div
      ref={panelRef}
      className={`absolute z-[80] w-[min(17.5rem,calc(100vw-1.5rem))] rounded-2xl border border-[#002FA7]/20 bg-[#FFFCF3] px-3 py-3 shadow-[0_16px_40px_rgba(0,47,167,0.18)] ${placementClass}`}
      role="dialog"
      aria-label={`LAB color for ${letterLabel}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold tracking-tight" style={{ color: INK }}>
          {letterLabel} · LAB
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-0.5 text-[10px] font-medium opacity-70 hover:bg-[#002FA7]/8"
          style={{ color: INK }}
          aria-label="Close color picker"
        >
          ✕
        </button>
      </div>
      <ByoChromaStack compact planeSize="popover" ink={INK} {...labPicker} />
    </div>
  );
}

/**
 * Single merged canvas: graph-paper + letter underlay, full-size P×S overlay (same bounds & radius).
 */
function LightSegmentColumn({
  label,
  hex,
  prominence,
  spread,
  onColorPickerClick,
  onAddToBg,
  onPxSChange,
  selected,
  colorPickerOpen,
  disabled,
  pageBackgroundHex,
  canvasFillHex,
  contrastOutline,
}: {
  label: string;
  hex: string;
  prominence: number;
  spread: number;
  onColorPickerClick: () => void;
  onAddToBg: () => void;
  onPxSChange: (p: number, s: number) => void;
  selected?: boolean;
  colorPickerOpen?: boolean;
  disabled?: boolean;
  pageBackgroundHex: string;
  canvasFillHex?: string;
  contrastOutline?: boolean;
}) {
  const h = hexWithHash(hexCore(hex));
  const labIconColor = byoLabSwatchIconColor(h);
  const borderSoft = "rgba(163, 177, 196, 0.9)";
  const ringOffset = coverageRingOffsetColor(pageBackgroundHex);
  const canvasBackground = canvasCellBackgroundStyle({ letterCanvasFillHex: canvasFillHex });

  return (
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center gap-2 sm:w-[8.25rem]">
      <div className={`flex w-full flex-col items-center ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <button
          type="button"
          onClick={onColorPickerClick}
          className={`relative mb-2 flex h-9 w-11 items-center justify-center overflow-hidden rounded-xl border-2 shadow-sm transition hover:opacity-95 sm:h-10 sm:w-12 ${
            colorPickerOpen ? "ring-2 ring-[#002FA7]/55 ring-offset-2" : ""
          }`}
          style={{
            borderColor: `${INK}40`,
            backgroundColor: h,
            ...(colorPickerOpen
              ? ({ ["--tw-ring-offset-color" as string]: ringOffset } as CSSProperties)
              : {}),
          }}
          title="Open LAB color picker"
          aria-expanded={colorPickerOpen}
          aria-haspopup="dialog"
        >
          <span className="pointer-events-none text-sm font-medium opacity-90 sm:text-base" style={{ color: labIconColor }}>
            ◎
          </span>
        </button>

        <div
          role="group"
          tabIndex={0}
          aria-label={`Letter ${label}: drag for P×S, double-click for uniform canvas fill.`}
          className={`relative aspect-square w-[5.5rem] min-h-[5.5rem] overflow-hidden rounded-3xl border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#002FA7]/40 sm:min-h-[6.75rem] sm:w-[6.75rem] ${
            selected ? "ring-2 ring-[#002FA7]/35 ring-offset-2" : ""
          }`}
          style={{
            borderColor: borderSoft,
            ...canvasBackground,
            ...(selected
              ? ({ ["--tw-ring-offset-color" as string]: ringOffset } as CSSProperties)
              : {}),
          }}
          onDoubleClick={onAddToBg}
          title="Double-click canvas — fill entire tile with this letter color (display only)"
        >
          <CanvasPxSGrid />
          <div className="pointer-events-none absolute inset-0 z-[1] flex select-none items-center justify-center">
            {(() => {
              const coreHex = hexCore(hex);
              const glyph = coveragePreviewGlyphStyles(
                coreHex,
                prominence,
                spread,
                label,
                canvasFillHex ?? pageBackgroundHex,
                { canvasCell: true, forceContrastOutline: contrastOutline },
              );
              const glyphFont = "Georgia, 'Times New Roman', serif";
              return (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
                  >
                    <span
                      className="block text-3xl font-semibold leading-none sm:text-4xl"
                      style={{
                        ...glyph.bloom,
                        fontFamily: glyphFont,
                      }}
                    >
                      {label}
                    </span>
                  </span>
                  <span
                    className="relative z-[1] text-3xl font-semibold leading-none sm:text-4xl"
                    style={{
                      ...glyph.fill,
                      fontFamily: glyphFont,
                      WebkitFontSmoothing: "antialiased",
                    }}
                  >
                    {label}
                  </span>
                </>
              );
            })()}
          </div>
          <div className="absolute inset-0 z-[2] min-h-0 min-w-0">
            <LabProminenceSpreadPicker
              fill
              prominence={prominence}
              spread={spread}
              onChange={onPxSChange}
              disabled={disabled}
              showAxisLabel={false}
              showCaption={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WordCoverageAnnotator({
  word,
  profile,
  indexHex,
  indexPxS,
  onIndexPxSChange,
  boundaryInfluence,
  onBoundaryInfluenceChange,
  selectedIndex,
  onSelectIndex,
  labPickerIndex,
  onLabPickerToggle,
  onCloseLabPicker,
  labPicker,
  onAddColorToBackground,
  canvasBgHex = {},
  wordBackgroundHex = COVERAGE_WORD_BACKGROUND,
  contrastBg,
}: Props) {
  const [showIntro, setShowIntro] = useState(false);
  const labAnchorRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const bindLabAnchorRef = (index: number) => (el: HTMLDivElement | null) => {
    labAnchorRefs.current[index] = el;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(COVERAGE_INTRO_SESSION_KEY) !== "1") {
      setShowIntro(true);
    }
  }, []);

  const dismissIntro = () => {
    try {
      sessionStorage.setItem(COVERAGE_INTRO_SESSION_KEY, "1");
    } catch {
      /* private mode */
    }
    setShowIntro(false);
  };

  const w = String(word);
  const { segmentAttrs, charAttrs } = useMemo(
    () => buildSegmentState(w, profile.letters, indexHex, indexPxS),
    [w, profile.letters, indexHex, indexPxS],
  );

  const charColors = useMemo(
    () => charColorsForPerCharSegments(w, segmentAttrs, charAttrs, boundaryInfluence),
    [w, segmentAttrs, charAttrs, boundaryInfluence],
  );

  const chars = Array.from(w);

  const rowRanges = useMemo(() => coverageRowRanges(w), [w]);
  const contrastOutline = contrastBg?.checked === true;
  const topLightHex = contrastOutline ? contrastBg?.suggestedHex : null;
  const wordSpotlight = topLightHex ? wordSpotlightLayers(topLightHex) : null;
  const ringOffset = coverageRingOffsetColor(wordBackgroundHex);

  const hasLetterBoundary = (leftIndex: number) => {
    if (leftIndex < 0 || leftIndex >= chars.length - 1) return false;
    return /[a-z]/i.test(chars[leftIndex]!) && /[a-z]/i.test(chars[leftIndex + 1]!);
  };

  const renderBoundaryBar = (leftIndex: number, key: string) => (
    <div key={key} className="flex shrink-0 flex-col items-center pb-0.5">
      <LabBoundaryBar
        leftHex={hexCore(charColors[leftIndex]!.hex)}
        rightHex={hexCore(charColors[leftIndex + 1]!.hex)}
        value={boundaryInfluence[leftIndex] ?? 0.5}
        onChange={(v) => onBoundaryInfluenceChange(leftIndex, v)}
        width={BOUNDARY_BAR_W}
        showLabels={false}
      />
    </div>
  );

  const renderAnnotatorRow = (rangeStart: number, rangeEnd: number, rowKey: string) => (
    <div
      key={rowKey}
      className="flex flex-wrap items-end justify-center gap-x-1 gap-y-2 overflow-visible sm:gap-x-1.5"
    >
      {Array.from({ length: rangeEnd - rangeStart }, (_, k) => rangeStart + k).map((i) => {
        const ch = chars[i]!;
        const low = ch.toLowerCase();
        const isLetter = /[a-z]/.test(low);
        const row = isLetter ? profile.letters[low] : undefined;
        const hex = indexHex[i] ?? row?.color ?? "#a8a29e";
        const ps = indexPxS[i] ?? COVERAGE_DEFAULT_PXS;
        return (
          <Fragment key={`col-${i}`}>
            {isLetter ? (
              <div ref={bindLabAnchorRef(i)} className="relative shrink-0">
                <LightSegmentColumn
                  label={ch.toUpperCase()}
                  hex={hex}
                  prominence={ps.prominence}
                  spread={ps.spread}
                  selected={selectedIndex === i}
                  colorPickerOpen={labPickerIndex === i}
                  onColorPickerClick={() => onLabPickerToggle(i)}
                  onAddToBg={() => onAddColorToBackground?.(hexWithHash(hexCore(hex)), i)}
                  onPxSChange={(p, s) => onIndexPxSChange(i, p, s)}
                  pageBackgroundHex={wordBackgroundHex}
                  canvasFillHex={canvasBgHex[i]}
                  contrastOutline={contrastOutline}
                />
                {labPickerIndex === i ? (
                  <CoverageLabPopover
                    letterLabel={ch.toUpperCase()}
                    getAnchor={() => labAnchorRefs.current[i] ?? null}
                    onClose={onCloseLabPicker}
                    labPicker={labPicker}
                  />
                ) : null}
              </div>
            ) : (
              <div className="w-8 shrink-0 sm:w-10" aria-hidden />
            )}
            {i < rangeEnd - 1 && hasLetterBoundary(i)
              ? renderBoundaryBar(i, `d-${i}`)
              : null}
          </Fragment>
        );
      })}
      {rangeEnd < w.length && hasLetterBoundary(rangeEnd - 1)
        ? renderBoundaryBar(rangeEnd - 1, `d-wrap-${rangeEnd - 1}`)
        : null}
    </div>
  );

  return (
    <div className="relative space-y-3">
      {showIntro ? <WordCoverageIntroOverlay onDismiss={dismissIntro} /> : null}

      <div className="relative">
        {contrastBg ? (
          <div
            className="relative z-[2] mx-auto mb-0 flex max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border border-[#002FA7]/12 bg-white/75 px-3 py-2 text-[11px] shadow-sm"
            style={{ color: INK }}
          >
            <span
              className="h-6 w-6 shrink-0 rounded-md border border-black/12 shadow-inner"
              style={{ backgroundColor: contrastBg.suggestedHex }}
              title={`Suggested background ${contrastBg.suggestedHex}`}
              aria-hidden
            />
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[#002FA7]/35 accent-[#002FA7]"
                checked={contrastBg.checked}
                onChange={(e) => contrastBg.onCheckedChange(e.target.checked)}
              />
              <span>Use contrast outlines + top light</span>
            </label>
            <span className="text-[10px] opacity-65">
              outline aid · wash {Math.round(contrastBg.minLContrast)} vs{" "}
              {Math.round(contrastBg.defaultMinLContrast)} on cream
            </span>
          </div>
        ) : null}

        <div className="relative px-1 pb-2 pt-1 sm:px-2">
          {wordSpotlight ? (
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-0 z-0 w-full max-w-3xl -translate-x-1/2"
              style={{ height: wordSpotlight.height }}
            >
              <div
                className="absolute inset-x-[-12%] top-0 bottom-[-8%]"
                style={wordSpotlight.spread}
              />
              <div className="absolute inset-0 top-0" style={wordSpotlight.core} />
            </div>
          ) : null}
          <div
            className="relative z-[1] flex flex-wrap justify-center gap-0.5 font-semibold tracking-tight"
            style={{
              fontSize: "clamp(2.2rem, 5.2vw, 3.75rem)",
              lineHeight: 1.12,
              color: INK,
              fontFamily: "Georgia, 'Times New Roman', serif",
              WebkitFontSmoothing: "antialiased",
            }}
          >
        {chars.map((ch, i) => {
          const cc = charColors[i] ?? { hex: "57534e", prominence: 0, spread: 0 };
          const coreHex = hexCore(cc.hex);
          const glyph = coveragePreviewGlyphStyles(
            coreHex,
            cc.prominence,
            cc.spread,
            ch,
            wordBackgroundHex,
            { forceContrastOutline: contrastOutline },
          );
          const isLetter = /[a-z]/i.test(ch);
          return (
            <span key={`${i}-${ch}`} className="relative isolate inline-block px-0.5 align-baseline sm:px-1">
              <span className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
                <span
                  aria-hidden
                  className="block"
                  style={{
                    ...glyph.bloom,
                    fontSize: "inherit",
                    fontWeight: "inherit",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    lineHeight: 1.12,
                  }}
                >
                  {ch.toUpperCase()}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => isLetter && onSelectIndex(i)}
                onDoubleClick={() => isLetter && onAddColorToBackground?.(hexWithHash(coreHex), i)}
                className={`relative z-[1] cursor-pointer select-none ${selectedIndex === i ? "ring-2 ring-[#002FA7]/55 ring-offset-2" : ""}`}
                style={{
                  ...glyph.fill,
                  ...(selectedIndex === i
                    ? ({ ["--tw-ring-offset-color" as string]: ringOffset } as CSSProperties)
                    : {}),
                }}
                title="Click to tune this letter · Double-click to add color to background"
              >
                {ch.toUpperCase()}
              </span>
            </span>
          );
        })}
          </div>
        </div>
      </div>

      <div className="space-y-3 overflow-visible sm:space-y-4">
        {rowRanges.map((r, idx) => renderAnnotatorRow(r.start, r.end, `annot-row-${r.start}-${r.end}-${idx}`))}
      </div>
    </div>
  );
}
