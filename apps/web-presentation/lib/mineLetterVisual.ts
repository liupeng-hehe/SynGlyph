import type { CSSProperties } from "react";

import { clampLab, hexToLab, labToHex } from "./labColor";
import { hexToRgb, punchRgbForDisplay, type RGB } from "./pxsVisual";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Stretch Field P so first-letter prominence reads more vividly. */
export function boostProminence(p: number): number {
  return clamp01(Math.pow(clamp01(p), 0.72) * 1.22);
}

/** Stretch Field S so soft onsets stay 虚 and endings stay 实. */
export function boostSpread(s: number): number {
  return clamp01(Math.pow(clamp01(s), 0.78));
}

function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function chromaOf(hex: string): number {
  const lab = hexToLab(hex);
  return Math.hypot(lab.a, lab.b);
}

/** Lift lightness and soften chroma for a luminous, less synthetic reading mode. */
function softenHexForMine(hex: string): string {
  const lab = hexToLab(hex);
  const next = clampLab(
    Math.min(94, 28 + lab.L * 0.7),
    lab.a * 0.58,
    lab.b * 0.58,
  );
  return labToHex(next.L, next.a, next.b);
}

/** Display-only: push Lab chroma so letter hues read like the older neon passage. */
export function punchHexForMine(hex: string): string {
  const lab = hexToLab(hex);
  const chroma = Math.hypot(lab.a, lab.b);
  if (chroma < 6) return hex.startsWith("#") ? hex : `#${hex}`;
  const scale = Math.min(1.7, 1.32 + 28 / (chroma + 10));
  let L = lab.L;
  if (L < 22 && chroma > 18) L += 10;
  const next = clampLab(L, lab.a * scale, lab.b * scale);
  return labToHex(next.L, next.a, next.b);
}

/** Keep 明 at high P; drop L* for 暗 so low-prominence letters actually read darker. */
export function shadeHexByProminence(hex: string, prominence: number): string {
  const p = boostProminence(prominence);
  const lab = hexToLab(hex);
  const keep = Math.pow(p, 0.62);
  const next = clampLab(lab.L * (0.26 + 0.74 * keep), lab.a, lab.b);
  return labToHex(next.L, next.a, next.b);
}

/** Horizontal ellipse: 1 at the center, ~0 past the rim. */
export function ellipseVivid(dx: number, dy: number, rx: number, ry: number): number {
  const nx = dx / Math.max(rx, 1);
  const ny = dy / Math.max(ry, 1);
  const n = nx * nx + ny * ny;
  if (n >= 1.85) return 0;
  return Math.exp(-n * 1.2);
}

export const MINE_SHOW_CENTER = 5;
export const MINE_SHOW_WORD = 3;
export const MINE_SHOW_NEIGHBOR = 2;
export const MINE_SHOW_ADJACENT_LINE = 1;
export const MINE_SHOW_SPAN = 8;

export type MineWordLayout = {
  id: number;
  line: number;
  col: number;
  letters: number;
};

/** Current word = 3 (center rises to 5). Same-line neighbors = 2, expanding to ~8 letters. Adjacent lines = 1. */
export function planMineVisibility(words: MineWordLayout[], currentId: number): Map<number, number> {
  const result = new Map<number, number>();
  const current = words.find((word) => word.id === currentId);
  if (!current) return result;

  const byLine = new Map<number, MineWordLayout[]>();
  for (const word of words) {
    const list = byLine.get(word.line) ?? [];
    list.push(word);
    byLine.set(word.line, list);
  }
  for (const list of byLine.values()) list.sort((a, b) => a.col - b.col);

  const line = byLine.get(current.line) ?? [];
  const idx = line.findIndex((word) => word.id === currentId);
  result.set(currentId, MINE_SHOW_WORD);

  let letters = current.letters;
  let left = idx - 1;
  let right = idx + 1;
  const take = (i: number) => {
    const word = line[i];
    if (!word) return 0;
    if (!result.has(word.id)) result.set(word.id, MINE_SHOW_NEIGHBOR);
    return word.letters;
  };

  if (left >= 0) {
    letters += take(left);
    left -= 1;
  }
  if (right < line.length) {
    letters += take(right);
    right += 1;
  }
  while (letters < MINE_SHOW_SPAN && (left >= 0 || right < line.length)) {
    if (left >= 0) {
      letters += take(left);
      left -= 1;
    }
    if (letters >= MINE_SHOW_SPAN) break;
    if (right < line.length) {
      letters += take(right);
      right += 1;
    }
  }

  for (const word of words) {
    if (word.line === current.line - 1 || word.line === current.line + 1) {
      if (!result.has(word.id)) result.set(word.id, MINE_SHOW_ADJACENT_LINE);
    }
  }
  return result;
}

export function letterShow(base: number, isCurrent: boolean, vivid: number): number {
  if (isCurrent) return (MINE_SHOW_WORD + (MINE_SHOW_CENTER - MINE_SHOW_WORD) * clamp01(vivid)) / MINE_SHOW_CENTER;
  return clamp01(base / MINE_SHOW_CENTER);
}

function rgbCss({ r, g, b }: RGB): string {
  return `rgb(${r},${g},${b})`;
}

/**
 * Now, Mine glyphs: luminous softened fill, 明暗 from P, 虚实 from S.
 * Keeps each hue recognizable without a harsh neon treatment.
 */
export function mineLetterStyle(hex: string, prominence: number, spread: number): CSSProperties {
  const p = boostProminence(prominence);
  const s = boostSpread(spread);
  const softened = softenHexForMine(
    shadeHexByProminence(punchHexForMine(hex), prominence),
  );
  const rgb = punchRgbForDisplay(hexToRgb(softened), 1.04);
  const lum = relLuminance(softened);
  const chroma = chromaOf(softened);
  const pale = lum > 0.84;
  const inkDark = lum < 0.07 && chroma < 12;
  const strokePx = 0.28 + p * 0.5;
  const glow = (0.8 + p * 4.2 + (1 - s) * 1.8) * 1.55;
  const halo = (2.4 + p * 7 + (1 - s) * 3.5) * 1.55;
  const glowA = Math.min(1, (pale ? 0.14 + p * 0.25 : 0.16 + p * 0.38) * 1.55);
  const haloA = Math.min(1, (pale ? 0.06 + p * 0.12 : 0.07 + p * 0.2 + (1 - s) * 0.05) * 1.55);
  const fill = inkDark ? rgbCss(rgb) : pale ? softened : rgbCss(rgb);
  const rim = pale ? `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.2 + p * 0.34).toFixed(2)})` : rgbCss(rgb);
  const blur = (1 - s) * 0.42;

  return {
    color: fill,
    WebkitTextFillColor: fill,
    WebkitTextStroke: inkDark ? undefined : `${strokePx.toFixed(2)}px ${rim}`,
    paintOrder: "stroke fill",
    textShadow: `0 0 ${glow.toFixed(1)}px rgba(${rgb.r},${rgb.g},${rgb.b},${glowA.toFixed(3)}), 0 0 ${halo.toFixed(1)}px rgba(${rgb.r},${rgb.g},${rgb.b},${haloA.toFixed(3)})`,
    ["--mine-blur" as string]: blur > 0.08 ? `${blur.toFixed(2)}px` : "0px",
  };
}
