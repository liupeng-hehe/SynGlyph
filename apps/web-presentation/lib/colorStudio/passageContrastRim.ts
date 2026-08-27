import type { CSSProperties } from "react";

import { deltaE } from "@/lib/colorStudio/colorNaming";
import { BYO_BG, BYO_INK } from "@/lib/colorStudio/byoTheme";
import { hexToLab, labToHex } from "@/lib/labColor";

function normHex(hex: string): string {
  const h = hex.replace("#", "").trim().padStart(6, "0").slice(0, 6);
  return `#${h}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(lumA: number, lumB: number): number {
  const hi = Math.max(lumA, lumB);
  const lo = Math.min(lumA, lumB);
  return (hi + 0.05) / (lo + 0.05);
}

function perceptualDeltaE(letterHex: string, backgroundHex: string): number {
  const a = hexToLab(normHex(letterHex));
  const b = hexToLab(normHex(backgroundHex));
  return deltaE([a.L, a.a, a.b], [b.L, b.a, b.b]);
}

/** Hue distance in degrees (0–180). */
function hueDistanceDeg(a: string, b: string): number {
  const toHue = (hex: string) => {
    const { r, g, b: bl } = hexToRgb(hex);
    const rn = r / 255;
    const gn = g / 255;
    const bn = bl / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    if (d < 1e-6) return 0;
    let h = 0;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return ((h * 60) + 360) % 360;
  };
  const da = Math.abs(toHue(a) - toHue(b));
  return Math.min(da, 360 - da);
}

/** Theme cream (BYO background) — rim on dark / similar-hue pairs. */
export const PASSAGE_RIM_YELLOW = BYO_BG;
/** Theme Klein blue — rim on light / similar-hue pairs. */
export const PASSAGE_RIM_BLUE = BYO_INK;

const DELTA_E_RIM = 32;
const RATIO_RIM = 3.35;
const SIMILAR_HUE_DEG = 38;

export function letterBackgroundContrastRatio(letterHex: string, backgroundHex: string): number {
  const lLetter = relLuminance(normHex(letterHex));
  const lBg = relLuminance(normHex(backgroundHex));
  return contrastRatio(lLetter, lBg);
}

/** Small same-hue edge stroke when fill ≈ background (fill color never changed). */
export function passageRimStrokePx(ratio: number, strokeBoost = 0): number {
  let px: number;
  if (ratio < 1.15) px = 0.72;
  else if (ratio < 1.35) px = 0.62;
  else if (ratio < 1.7) px = 0.54;
  else if (ratio < 2.2) px = 0.48;
  else px = 0.45;
  return px + strokeBoost;
}

/** Letters whose glyph is mostly stroke — halo should stay same-hue, no dark outer ring. */
const THIN_STROKE_LETTERS = new Set([
  "I",
  "i",
  "l",
  "1",
  "|",
  "j",
  "J",
  "L",
  "t",
  "f",
  "r",
  "Ⅰ",
  "ı",
]);

export function isThinStrokeLetter(char: string | undefined): boolean {
  if (!char) return false;
  const c = char.trim();
  return c.length === 1 && THIN_STROKE_LETTERS.has(c);
}

export function passageLetterNeedsContrastRim(
  letterHex: string,
  backgroundHex: string,
): boolean {
  const letter = normHex(letterHex);
  const bg = normHex(backgroundHex);
  const lLetter = relLuminance(letter);
  const lBg = relLuminance(bg);
  const ratio = contrastRatio(lLetter, lBg);
  const dE = perceptualDeltaE(letter, bg);
  const hueNear = hueDistanceDeg(letter, bg) <= SIMILAR_HUE_DEG;

  try {
    const lab = hexToLab(letter);
    const bgLab = hexToLab(bg);
    const chroma = Math.hypot(lab.a, lab.b);
    /** Light yellow/gold on cream — chroma inflates dE but luminance contrast is still poor. */
    if (lab.L >= 66 && bgLab.L >= 84 && lab.b >= 4 && ratio < 2.5) return true;
    /** Pale neutral fill (white/beige L) on cream. */
    if (lab.L >= 72 && bgLab.L >= 82 && chroma < 16 && ratio < 2.6) return true;
    /** Any light glyph on a light passage with weak contrast. */
    if (lab.L >= 70 && bgLab.L >= 80 && ratio < 2.15) return true;
  } catch {
    /* ignore */
  }

  if (dE <= DELTA_E_RIM) return true;
  if (ratio < RATIO_RIM) return true;
  if (hueNear && ratio < 4.8) return true;
  if (hueNear && Math.abs(lLetter - lBg) < 0.22) return true;

  return false;
}

/**
 * Border color only — same hue as fill, separated from the passage background in L*.
 * On light passages the rim is always darker than the background (never lightened).
 */
export function toneAdjacentRimColor(letterHex: string, backgroundHex: string): string {
  const letter = normHex(letterHex);
  const bg = normHex(backgroundHex);
  const ratio = letterBackgroundContrastRatio(letter, bg);

  try {
    const lab = hexToLab(letter);
    const bgLab = hexToLab(bg);
    const chroma = Math.hypot(lab.a, lab.b);

    if (bgLab.L >= 52) {
      const minGap =
        ratio < 1.12 ? 38 : ratio < 1.28 ? 32 : ratio < 1.55 ? 26 : ratio < 2.0 ? 20 : 14;
      let targetL = Math.max(14, Math.min(lab.L - minGap, bgLab.L - 19));

      if (chroma < 12) {
        targetL = Math.min(targetL, bgLab.L - 40);
      } else if (lab.b > 10) {
        targetL = Math.min(targetL, bgLab.L - 28);
      }

      return labToHex(targetL, lab.a, lab.b);
    }

    const minGap = ratio < 1.5 ? 20 : 14;
    const targetL = Math.min(94, Math.max(lab.L + minGap, bgLab.L + 13));
    return labToHex(targetL, lab.a, lab.b);
  } catch {
    const lLetter = relLuminance(letter);
    const lBg = relLuminance(bg);
    return lLetter >= lBg ? PASSAGE_RIM_BLUE : PASSAGE_RIM_YELLOW;
  }
}

/** Stroke only — sits under fill via paintOrder; P×S glow stays on textShadow above. */
export function passageContrastEdgeStyle(
  letterHex: string,
  backgroundHex: string,
  opts?: { strokeBoost?: number; strong?: boolean },
): CSSProperties {
  if (!passageLetterNeedsContrastRim(letterHex, backgroundHex)) return {};

  const ratio = letterBackgroundContrastRatio(letterHex, backgroundHex);
  const strong = opts?.strong === true;
  const rimHex = strong
    ? coverageStrongRimColor(letterHex, backgroundHex)
    : toneAdjacentRimColor(letterHex, backgroundHex);
  const boost = (opts?.strokeBoost ?? 0) + (strong ? 0.62 : 0);
  let strokePx = passageRimStrokePx(ratio, boost);
  if (strong) {
    strokePx = Math.max(strokePx, ratio < 1.25 ? 1.45 : ratio < 1.8 ? 1.28 : 1.12);
  }

  return {
    WebkitTextStroke: `${strokePx.toFixed(2)}px ${rimHex}`,
    paintOrder: "stroke fill",
  };
}

/** Darker rim for coverage contrast mode — light fills on cream need a visible edge. */
function coverageStrongRimColor(letterHex: string, backgroundHex: string): string {
  try {
    const lab = hexToLab(normHex(letterHex));
    const bgLab = hexToLab(normHex(backgroundHex));
    const ratio = letterBackgroundContrastRatio(letterHex, backgroundHex);
    const chroma = Math.hypot(lab.a, lab.b);
    const minGap = ratio < 1.12 ? 48 : ratio < 1.3 ? 42 : ratio < 1.6 ? 36 : ratio < 2.1 ? 30 : 24;
    let targetL = Math.max(10, Math.min(lab.L - minGap, bgLab.L - 30));
    if (lab.L >= 76 || chroma < 14) {
      targetL = Math.min(targetL, bgLab.L - 44);
    }
    if (lab.L >= 88) {
      targetL = Math.min(targetL, 38);
    }
    return labToHex(targetL, lab.a * 0.82, lab.b * 0.82);
  } catch {
    return PASSAGE_RIM_BLUE;
  }
}

/**
 * Thin stroke when letter fill is too close to passage background (incl. same-hue pairs).
 */
export function passageContrastRimStyle(
  letterHex: string,
  backgroundHex: string,
): CSSProperties {
  return passageContrastEdgeStyle(letterHex, backgroundHex);
}
