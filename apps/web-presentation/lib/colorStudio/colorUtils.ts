import { hexToLab } from "@synglyph/shared";

import type { LetterColor, PaletteOrigin, SuggestedTextColor } from "./types";

import { hexFromLab, hexToRgb, labObjectFromHex, normalizeHex } from "./colorAdapter";
import { nearestNamedColor } from "./colorNaming";

/** HSL 0–360, 0–100, 0–100 → #RRGGBB */
export function hslToHex(h: number, s: number, lightness: number): string {
  const s1 = Math.max(0, Math.min(100, s)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h >= 0 && h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function linearizeChannel(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Relative luminance for sRGB */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map(linearizeChannel);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Mix hexA toward hexB by amount t in [0,1] */
export function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(a.r + (b.r - a.r) * k);
  const g = Math.round(a.g + (b.g - a.g) * k);
  const bl = Math.round(a.b + (b.b - a.b) * k);
  const toH = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toH(r)}${toH(g)}${toH(bl)}`;
}

/** intensity 0–100: fraction of raw mixed from white (100 = full raw) */
export function softenRawBackground(rawHex: string, intensityPercent: number): string {
  const raw = normalizeHex(rawHex);
  const t = Math.max(0, Math.min(100, intensityPercent)) / 100;
  return mixHex("#FFFFFF", raw, t);
}

/** Map contrast 0–100 (higher = stronger text) */
export function textColorForPdfBackground(
  bgHex: string,
  contrastPercent: number,
): string {
  const white = "#FFFFFF";
  const black = "#191919";
  const Lu = relativeLuminance(bgHex);
  const base = Lu > 0.45 ? black : white;
  const other = Lu > 0.45 ? white : black;
  const t = 1 - Math.max(0, Math.min(100, contrastPercent)) / 100;
  return mixHex(base, other, t * 0.35);
}

/** Stipple ink: shift L* only — darker if bg is light (L>50), lighter if bg is dark (L≤50). */
export function stippleDotHex(backgroundHex: string): string {
  const clean = normalizeHex(backgroundHex).replace("#", "");
  const [L, a, b] = hexToLab(clean);
  const bump = 16;
  const L2 = L >= 50 ? Math.max(2, L - bump) : Math.min(98, L + bump);
  return hexFromLab(L2, a, b);
}

/**
 * Neutral high-contrast halftone dots from background CIELAB L* (synesthetic cards).
 * L* > 50 → dark ink; L* ≤ 50 → light ink (readable on saturated canvases vs hue-shifted stippleDotHex alone).
 */
export function stippleContrastInkHexFromLab(L: number): string {
  return L > 50 ? "#171717" : "#F5F5F5";
}

/**
 * Hue-aware halftone ink: push L* in LAB while keeping chroma similar to the background,
 * then blend slightly toward neutral shadow/highlight (L* > 50 → darker accent, otherwise lighter)
 * so dots stay on-brand but not pure black/white.
 */
export function stippleSynestheticInkHex(backgroundHex: string): string {
  const hexNorm = normalizeHex(backgroundHex);
  const clean = hexNorm.replace("#", "");
  const [L, a, b] = hexToLab(clean);
  const bump = 26;
  const L2 =
    L > 50 ? Math.max(4, L - bump) : Math.min(96, L + bump);
  const chromatic = hexFromLab(L2, a, b);
  const neutral = L > 50 ? "#141414" : "#FAFAFA";
  // Slightly stronger neutral pull in the mid luminance band (ambiguous contrast).
  const Lu = relativeLuminance(hexNorm);
  const pull =
    Lu > 0.38 && Lu < 0.62 ? 0.34 : Lu >= 0.62 ? 0.22 : 0.28;
  return mixHex(chromatic, neutral, pull);
}

export function buildLetterColor(
  letter: string,
  hexInput: string,
  paletteOrigin: PaletteOrigin,
  overrides?: Partial<
    Pick<LetterColor, "customColorName" | "nameSource" | "prominence" | "spread">
  >,
): LetterColor {
  const hex = normalizeHex(hexInput);
  const rgb = hexToRgb(hex);
  const lab = labObjectFromHex(hex);
  const { suggestedName, deltaE } = nearestNamedColor(hex);
  const customColorName = overrides?.customColorName;
  const nameSource =
    overrides?.nameSource ?? (customColorName ? "user" : "local");
  return {
    letter,
    hex,
    rgb,
    lab,
    suggestedColorName: suggestedName,
    customColorName,
    nameSource,
    deltaE,
    paletteOrigin,
    prominence: overrides?.prominence,
    spread: overrides?.spread,
  };
}

export function applyHexToLetterColor(
  prev: LetterColor,
  hexInput: string,
  naming?: "local" | "api",
): LetterColor {
  const hex = normalizeHex(hexInput);
  const rgb = hexToRgb(hex);
  const lab = labObjectFromHex(hex);
  const { suggestedName, deltaE } = nearestNamedColor(hex);
  const keepUser = Boolean(prev.customColorName);
  return {
    ...prev,
    hex,
    rgb,
    lab,
    suggestedColorName: suggestedName,
    deltaE,
    nameSource: keepUser ? "user" : (naming ?? "local"),
  };
}

/** Golden-angle hue spread for A–Z */
export function exampleHexForIndex(i: number): string {
  const h = (i * 137.508) % 360;
  const s = 58 + (i % 4) * 6;
  const l = 46 + (i % 6) * 3;
  return hslToHex(h, s, l);
}

export function generateExampleLetters(): LetterColor[] {
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  return letters.map((letter, i) =>
    buildLetterColor(letter, exampleHexForIndex(i), "generated"),
  );
}

export function defaultLetters(): LetterColor[] {
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  return letters.map((letter, i) =>
    buildLetterColor(letter, exampleHexForIndex(i), "default"),
  );
}

export function applyHexToSuggested(
  prev: SuggestedTextColor,
  hexInput: string,
  naming?: "local" | "api",
): SuggestedTextColor {
  const hex = normalizeHex(hexInput);
  const lab = labObjectFromHex(hex);
  const { suggestedName, deltaE } = nearestNamedColor(hex);
  const keepUser = Boolean(prev.customColorName);
  return {
    ...prev,
    hex,
    lab,
    suggestedColorName: suggestedName,
    deltaE,
    nameSource: keepUser ? "user" : (naming ?? "local"),
  };
}
