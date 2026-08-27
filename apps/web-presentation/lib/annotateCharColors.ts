/**
 * Ported from apps/web-english/app/annotate/[stimulusId]/page.tsx (charColors useMemo).
 * Single-character segments: one entry per code unit in `word`.
 * P/S are raw [0,1] as in ProminenceSpreadPicker / SegmentInput (no display remap).
 */

import type { CSSProperties } from "react";

import { BYO_BG } from "@/lib/colorStudio/byoTheme";
import {
  isThinStrokeLetter,
  passageContrastEdgeStyle,
  passageLetterNeedsContrastRim,
} from "@/lib/colorStudio/passageContrastRim";

import { labToHex } from "@/lib/labColor";

export function hexWithoutHash(hex: string): string {
  return hex.replace(/^#/, "");
}

export function hexWithHash(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

export function blendHex(hexLeft: string, hexRight: string, t: number): string {
  const l = hexWithoutHash(hexLeft).padStart(6, "0");
  const r = hexWithoutHash(hexRight).padStart(6, "0");
  const r1 = parseInt(l.slice(0, 2), 16),
    g1 = parseInt(l.slice(2, 4), 16),
    b1 = parseInt(l.slice(4, 6), 16);
  const r2 = parseInt(r.slice(0, 2), 16),
    g2 = parseInt(r.slice(2, 4), 16),
    b2 = parseInt(r.slice(4, 6), 16);
  const rr = Math.round(r1 * t + r2 * (1 - t));
  const gg = Math.round(g1 * t + g2 * (1 - t));
  const bb = Math.round(b1 * t + b2 * (1 - t));
  return [rr, gg, bb]
    .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
    .join("");
}

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const raw = hexWithoutHash(hexWithHash(hex)).padStart(6, "0");
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

/** sRGB relative luminance in [0, 1]. */
function relLuminance(hex: string): number {
  const { r, g, b } = rgbFromHex(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

const INK_RGB = { r: 0, g: 47, b: 167 };

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
}

function rgbToCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** P×S canvas bottom-left (low P, low S) — 0 at center/top-right, 1 at origin. */
function canvasBottomLeftSoftness(prominence: number, spread: number): number {
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  return Math.max(0, 1 - p / 0.42) * Math.max(0, 1 - s / 0.42);
}

/** Soft edge amount for coverage word row — peaks at bottom-left, stays readable. */
function coverageEdgeSoftness(prominence: number, spread: number): number {
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const lowP = Math.max(0, 1 - p / 0.55);
  const lowS = Math.max(0, 1 - s / 0.55);
  const corner = lowP * lowS;
  const edge = Math.max(corner * 0.92, lowS * 0.35 * (1 - p * 0.45));
  return Math.max(0, Math.min(1, edge));
}

/**
 * Coverage glow remap: knob P=0 reads like old P=0.5; knob P=1 ≈ 2× old P=1 intensity.
 */
function coverageVisualProminence(prominence: number): number {
  const p = Math.max(0, Math.min(1, prominence));
  return 0.5 + p * 1.5;
}

/** Shift P axis for glow softness so knob P0 matches the old P0.5 halo (not extra bottom-left boost). */
function coverageGlowProminenceAxis(prominence: number): number {
  const p = Math.max(0, Math.min(1, prominence));
  return Math.min(1, p + 0.5);
}

/** Spread-driven halo — tiny at knob P0; full bloom once P rises. */
function coverageSpreadHaloFactor(prominence: number): number {
  const gp = coverageGlowProminenceAxis(prominence);
  const raised = Math.max(0, Math.min(1, (gp - 0.5) / 0.5));
  return 0.14 + raised * 0.86;
}

/** At low P, S softens edges (+ hint of halo); at high P it also feeds full bloom. */
function coverageSpreadEdgeSoften(spread: number, prominence: number): number {
  const s = Math.max(0, Math.min(1, spread));
  const gp = coverageGlowProminenceAxis(prominence);
  const raised = Math.max(0, Math.min(1, (gp - 0.5) / 0.5));
  return s * (0.58 + raised * 0.24);
}

/** S → 1: letter fades toward transparent (not darker). Returns opacity to subtract. */
function coverageSpreadTransparency(spread: number): number {
  const s = Math.max(0, Math.min(1, spread));
  return s * s * 0.38 + s * 0.14;
}

/**
 * Duplicate-glyph underlay: scaled + blurred — reads as a halo, not a rectangle.
 * Thin strokes and near-white glyphs keep same-hue bloom (no Klein-blue dark ring).
 */
export function annotateGlyphBloomUnderlayStyle(
  hex: string,
  prominence: number,
  spread: number,
  letter?: string,
  opts?: { wordRow?: boolean; canvasCell?: boolean },
): CSSProperties {
  const h0 = hexWithHash(hex);
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const base = rgbFromHex(h0);
  const lum = relLuminance(h0);
  const thin = isThinStrokeLetter(letter);
  const wordRow = opts?.wordRow === true;
  const coverageGlow = wordRow || opts?.canvasCell === true;
  const gp = coverageGlow ? coverageGlowProminenceAxis(p) : p;
  const vp = coverageGlow ? coverageVisualProminence(p) : p;
  const sh = coverageGlow ? coverageSpreadHaloFactor(p) : 1;
  const se = coverageGlow ? coverageSpreadEdgeSoften(s, p) : s;
  const st = coverageGlow ? coverageSpreadTransparency(s) : 0;
  const cornerSoft = opts?.canvasCell ? canvasBottomLeftSoftness(gp, s) : 0;
  const edgeSoft = wordRow ? coverageEdgeSoftness(gp, s) : 0;
  /** Near-white glyphs: keep bloom in letter hue; avoid mixing toward ink (dark outer ring). */
  let inkMix = thin || lum > 0.82 ? 0 : 0.12 + vp * 0.22 + se * (0.06 + sh * 0.06);
  /** Cap mix so near-white keeps hue but bloom stays a halo, not a flat Klein fill. */
  const inkT = Math.max(0, Math.min(0.68, inkMix));
  const bloomRgb = mixRgb(base, INK_RGB, inkT);
  let scale = 1.07 + vp * 0.11 + s * 0.05;
  let blurPx = 3.2 + s * 12 + (1 - vp) * 3.5;
  let opacity = 0.28 + vp * 0.34 + s * 0.14;
  if (wordRow) {
    scale = 1.04 + edgeSoft * 0.1 + vp * 0.08 + s * sh * 0.06 + se * 0.04;
    blurPx = 3.8 + edgeSoft * 5.5 + s * sh * 12 + vp * s * sh * 4 + se * 4.2;
    opacity = Math.min(0.62, 0.22 + edgeSoft * 0.28 + vp * 0.18 + s * sh * 0.12 + se * 0.06);
  }
  if (cornerSoft > 0) {
    blurPx += cornerSoft * 2.5;
    opacity = Math.min(0.52, opacity + cornerSoft * 0.06);
    scale += cornerSoft * 0.02;
  } else if (opts?.canvasCell) {
    blurPx += 1.2 + s * sh * 2.5 + vp * 3.5 + se * 3.6;
    scale += 0.02;
    /** High P: wider even blur, less scale — halo rings the glyph instead of pooling in a corner. */
    if (vp > 1.05) {
      blurPx += (vp - 1.05) * 10;
      scale = Math.min(scale, 1.06 + s * 0.05);
    }
  }
  if (coverageGlow) {
    opacity = Math.max(wordRow ? 0.14 : 0.2, opacity - st * (wordRow ? 0.55 : 0.45));
  }
  return {
    color: rgbToCss(bloomRgb),
    transform: `scale(${scale.toFixed(3)})`,
    transformOrigin: "center center",
    filter: `blur(${blurPx.toFixed(2)}px)`,
    opacity: Math.min(wordRow ? 0.58 : 0.92, opacity),
  };
}

export type AnnotateWordLetterStyleOpts = {
  /** Coverage preview word row and P×S canvas — crisp fill + soft underlay halo. */
  wordRow?: boolean;
  /** Color Studio passage card: crisper glyphs, less diffuse blur. */
  passagePreview?: boolean;
  /** Single glyph — thin strokes skip dark halo rims. */
  letter?: string;
  /** Passage/card background for low-contrast rim (default cream BYO). */
  backgroundHex?: string;
  /** P×S canvas tile — slightly thicker contrast rim (wordRow styling still applies). */
  canvasCell?: boolean;
  /** Coverage contrast mode — stronger outline on cream, no fill backdrop. */
  forceContrastOutline?: boolean;
};

/**
 * Big-word halo / blur / opacity — annotate / coverage preview.
 * High prominence: stronger fill + tighter glow (small core blur, no huge diffuse ring).
 */
export function annotateWordLetterStyle(
  hex: string,
  prominence: number,
  spread: number,
  opts?: AnnotateWordLetterStyleOpts,
): CSSProperties {
  const h = hexWithHash(hex);
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const wordRow = opts?.wordRow === true;
  const passagePreview = opts?.passagePreview === true;
  const coverageGlow = wordRow || opts?.canvasCell === true;
  const gp = coverageGlow ? coverageGlowProminenceAxis(p) : p;
  const vp = coverageGlow ? coverageVisualProminence(p) : p;
  const sh = coverageGlow ? coverageSpreadHaloFactor(p) : 1;
  const se = coverageGlow ? coverageSpreadEdgeSoften(s, p) : s;
  const st = coverageGlow ? coverageSpreadTransparency(s) : 0;
  const backgroundHex = hexWithHash(opts?.backgroundHex ?? BYO_BG);
  const lum = relLuminance(h);
  /** High P recovers fill lost to spread; at P≈1 matches “max prominence” saturation. */
  let opacity = Math.min(1, 0.5 + (1 - s) * 0.38 + vp * 0.22 + vp * s * 0.3);
  if (wordRow) opacity = Math.min(1, 0.9 + vp * 0.07 - s * sh * 0.06);
  if (passagePreview) opacity = Math.max(0.94, opacity);
  let textBlur = s * 1.5 * (1 - p * 0.92);
  let coreBlur = p * 7;
  let softBlur = (1 - p) * (4 + 24 * p);
  let edgeSoft = 0;
  if (wordRow) {
    edgeSoft = coverageEdgeSoftness(gp, s);
    /** Low P: S softens edges only; halo from S kicks in as P rises. */
    textBlur = edgeSoft * 0.35 + se * 3.35;
    coreBlur = vp * 4 + s * sh * 5 + edgeSoft * 2.5 + se * 1.2;
    softBlur = 4 + edgeSoft * 7 + s * sh * (10 + vp * 5) + se * 5.8;
  }
  if (opts?.canvasCell) {
    const cornerSoft = canvasBottomLeftSoftness(gp, s);
    textBlur += cornerSoft * 0.6;
    softBlur += cornerSoft * 4;
    opacity -= cornerSoft * 0.04;
  }
  if (coverageGlow) opacity = Math.max(0.34, opacity - st);
  if (lum > 0.86 && st < 0.14) opacity = Math.max(opacity, wordRow ? 0.92 : 0.78);
  if (passagePreview) {
    textBlur *= 0.2;
    coreBlur = p * 4.5;
    softBlur *= 0.55;
  }
  const { r, g, b } = rgbFromHex(h);
  const fade = coverageGlow ? Math.max(0.45, 1 - st * 1.15) : 1;
  const backLayers: string[] = [];
  if (wordRow) {
    const wideR = 10 + edgeSoft * 14 + s * sh * 16 + vp * 6 + se * 7;
    const midR = 4 + edgeSoft * 6 + s * sh * 9 + vp * 3 + se * 3.5;
    const aWide = (0.035 + edgeSoft * 0.05 + s * sh * 0.07 + se * 0.04) * fade;
    const aMid = (0.14 + edgeSoft * 0.12 + s * sh * 0.14 + vp * 0.12 + se * 0.07) * fade;
    backLayers.push(`0 0 ${wideR.toFixed(1)}px rgba(${r},${g},${b},${aWide.toFixed(3)})`);
    backLayers.push(`0 0 ${midR.toFixed(1)}px rgba(${r},${g},${b},${aMid.toFixed(3)})`);
  }
  const frontLayers: string[] = [];
  if (coreBlur >= 0.45) frontLayers.push(`0 0 ${coreBlur.toFixed(1)}px ${h}`);
  if (softBlur >= 0.45) frontLayers.push(`0 0 ${softBlur.toFixed(1)}px ${h}`);
  const textShadow =
    [...backLayers, ...frontLayers].length > 0
      ? [...backLayers, ...frontLayers].join(", ")
      : `0 0 2px ${h}`;

  const out: CSSProperties = {
    color: h,
    textShadow,
    opacity,
    filter: textBlur > 0.08 ? `blur(${textBlur.toFixed(2)}px)` : undefined,
  };

  if (passageLetterNeedsContrastRim(h, backgroundHex)) {
    const force = opts?.forceContrastOutline === true;
    const edge = passageContrastEdgeStyle(h, backgroundHex, {
      strong: force,
      strokeBoost: force
        ? opts?.canvasCell
          ? 0.22
          : 0.16
        : opts?.canvasCell
          ? 0.2
          : wordRow
            ? 0.1
            : 0,
    });
    out.WebkitTextStroke = edge.WebkitTextStroke;
    out.paintOrder = edge.paintOrder;
  }

  return out;
}

/** Shared P×S glyph look for coverage word row + canvas column (keep in sync). */
export function coveragePreviewGlyphStyles(
  hex: string,
  prominence: number,
  spread: number,
  letter: string,
  backgroundHex: string,
  opts?: { canvasCell?: boolean; forceContrastOutline?: boolean },
): { bloom: CSSProperties; fill: CSSProperties } {
  const core = hexWithoutHash(hexWithHash(hex));
  return {
    bloom: annotateGlyphBloomUnderlayStyle(core, prominence, spread, letter, {
      wordRow: true,
      canvasCell: opts?.canvasCell,
    }),
    fill: annotateWordLetterStyle(core, prominence, spread, {
      wordRow: true,
      letter,
      backgroundHex,
      canvasCell: opts?.canvasCell,
      forceContrastOutline: opts?.forceContrastOutline,
    }),
  };
}

const PASSAGE_SPLIT_TOP = "#000000";

function passageBottomHex(hex: string, prominence: number): string {
  const h = hexWithHash(hex);
  const p = Math.max(0, Math.min(1, prominence));
  if (p >= 0.5) return h;
  return `#${blendHex("57534e", hexWithoutHash(h), 1 - p / 0.5)}`;
}

/** Soft P×S bloom behind split glyphs (separate layer — shadow clip on text fill is unreliable). */
export function passageSplitLetterGlowStyle(
  hex: string,
  prominence: number,
  spread: number,
): CSSProperties {
  const h = hexWithHash(hex);
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const { r, g, b } = rgbFromHex(h);
  const coreBlur = 2 + p * 6 + s * 4;
  const softBlur = 6 + s * 18 + (1 - p) * 5;
  return {
    color: h,
    opacity: Math.min(0.85, 0.2 + p * 0.35 + s * 0.25),
    textShadow: [
      `0 0 ${coreBlur.toFixed(1)}px rgba(${r},${g},${b},${(0.35 + p * 0.35).toFixed(3)})`,
      `0 0 ${softBlur.toFixed(1)}px rgba(${r},${g},${b},${(0.12 + s * 0.28).toFixed(3)})`,
    ].join(", "),
    filter: s > 0.08 ? `blur(${(s * 2.8).toFixed(2)}px)` : undefined,
  };
}

/** Passage preview: split type (black top / palette hue bottom) + opacity from P. */
export function passageSplitLetterStyle(
  hex: string,
  prominence: number,
  spread: number,
): CSSProperties {
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const bottom = passageBottomHex(hex, prominence);
  const opacity = Math.min(1, 0.78 + p * 0.18 + (1 - s) * 0.04);

  return {
    backgroundImage: `linear-gradient(180deg, ${PASSAGE_SPLIT_TOP} 0%, ${PASSAGE_SPLIT_TOP} 50%, ${bottom} 50%, ${bottom} 100%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    opacity,
  };
}

/** Punctuation / neutral glyphs in split passage layout. */
export function passageSplitNeutralStyle(): CSSProperties {
  return { color: PASSAGE_SPLIT_TOP, opacity: 0.92 };
}

export type SegmentLab = { color_lab: [number, number, number]; prominence: number; spread: number };

const DEFAULT_LAB: [number, number, number] = [100, 0, 0];

/**
 * Per-character segments (annotate with splits every position).
 * `segmentAttrs[i]` matches `word[i]`; `boundaryInfluence[k]` is between k and k+1.
 */
export function charColorsForPerCharSegments(
  word: string,
  segmentAttrs: SegmentLab[],
  charAttrs: Record<number, { prominence: number; spread: number }>,
  boundaryInfluence: number[],
): { hex: string; prominence: number; spread: number }[] {
  const segments = Array.from(word);
  const result: { hex: string; prominence: number; spread: number }[] = [];
  const hexes = segments.map((_, segIdx) => {
    const a = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
    const L = a.color_lab[0];
    const aa = a.color_lab[1];
    const bb = a.color_lab[2];
    try {
      return labToHex(L, aa, bb);
    } catch {
      return "57534e";
    }
  });

  let pos = 0;
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segAttrs = segmentAttrs[segIdx] ?? { color_lab: DEFAULT_LAB, prominence: 0, spread: 0 };
    const segHex = hexes[segIdx]!;
    const leftHex = segIdx > 0 ? hexes[segIdx - 1]! : null;
    const rightHex = segIdx < segments.length - 1 ? hexes[segIdx + 1]! : null;
    const infPrev = boundaryInfluence[segIdx - 1] ?? 0.5;
    const infNext = boundaryInfluence[segIdx] ?? 0.5;
    const n = segments[segIdx]!.length;
    for (let i = 0; i < n; i++) {
      const charIdx = pos + i;
      const ca = charAttrs[charIdx];
      let hex = segHex;
      if (leftHex && segIdx > 0 && infPrev > 0.5) {
        const leftWeight = (infPrev - 0.5) * 2 * (1 - i / n);
        hex = blendHex(leftHex, hex, leftWeight);
      }
      if (rightHex && segIdx < segments.length - 1 && infNext < 0.5) {
        const rightAmount = (1 - 2 * infNext) * ((i + 1) / n);
        hex = blendHex(hex, rightHex, 1 - rightAmount);
      }
      result.push({
        hex,
        prominence: ca?.prominence ?? segAttrs.prominence ?? 0,
        spread: ca?.spread ?? segAttrs.spread ?? 0,
      });
    }
    pos += n;
  }
  return result;
}
