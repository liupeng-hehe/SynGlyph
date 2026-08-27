/**
 * P×S letter styling — aligned with apps/web-english (annotate / text-reveal).
 * Used on light backgrounds with boosted minimum opacity for readability.
 */

import type { CSSProperties } from "react";

export type RGB = { r: number; g: number; b: number };

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").padStart(6, "0").slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Stronger per-letter hue (display only) — matches web-english. */
export function punchRgbForDisplay(rgb: RGB, factor = 1.18): RGB {
  const avg = (rgb.r + rgb.g + rgb.b) / 3;
  return {
    r: clamp255(avg + (rgb.r - avg) * factor),
    g: clamp255(avg + (rgb.g - avg) * factor),
    b: clamp255(avg + (rgb.b - avg) * factor),
  };
}

export function remapSpreadForVisual(spread: number): number {
  return Math.min(1, 2 * clamp01(spread));
}

export function remapProminenceForVisual(prominence: number): number {
  return clamp01((clamp01(prominence) - 0.3) / 0.7);
}

export interface GlyphVisualStyle {
  fillAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  strokeStyle: string | null;
  strokeWidth: number;
}

export function visualStyleFromPxS(prominence: number, spread: number, rgb: RGB, fontSizePx: number): GlyphVisualStyle {
  const p = remapProminenceForVisual(prominence);
  const s = remapSpreadForVisual(spread);
  const fillAlpha = 0.08 + 0.92 * p;
  const shadowBlur = s * fontSizePx * (0.55 + 0.75 * s);
  const shadowA = 0.22 + 0.68 * s;
  const shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${shadowA})`;
  const strokeW = 0.45 + p * 2.65;
  const strokeStyle =
    p > 0.04
      ? `rgba(${Math.round(rgb.r * 0.42)},${Math.round(rgb.g * 0.42)},${Math.round(rgb.b * 0.42)},${0.2 + 0.48 * p})`
      : null;
  return {
    fillAlpha,
    shadowBlur,
    shadowColor,
    strokeStyle,
    strokeWidth: strokeW,
  };
}

/** Display P ∈ [0,1] → render input (web-english editor map). */
export function mapPForRender(pDisplay: number): number {
  const p = clamp01(pDisplay);
  return Math.max(0.5, Math.min(1, 0.5 + 0.5 * p));
}

/** Display S ∈ [0,1] → render input. */
export function mapSForRender(sDisplay: number): number {
  const s = clamp01(sDisplay);
  return Math.max(0, Math.min(0.5, 0.5 * s));
}

/** Stored / API values — same space as English annotate `SegmentInput` and letter_sequence targets. */
export function modelPxSFromDisplay(pDisplay: number, sDisplay: number): { prominence: number; spread: number } {
  return {
    prominence: mapPForRender(pDisplay),
    spread: mapSForRender(sDisplay),
  };
}

/** UI picker (display) ↔ inverse of mapPForRender / mapSForRender for hydration. */
export function displayPxSFromModel(prominence: number, spread: number): { p: number; s: number } {
  const prom = clamp01(prominence);
  const spr = clamp01(spread);
  const p = prom <= 0.5 ? 0 : clamp01((prom - 0.5) / 0.5);
  const s = Math.min(1, spr / 0.5);
  return { p, s: clamp01(s) };
}

export type LightGlyphCss = {
  color: string;
  opacity: number;
  textShadow: string;
  WebkitTextStroke?: string;
  paintOrder?: CSSProperties["paintOrder"];
  filter?: string;
};

const LIGHT_BG_MIN_OPACITY = 0.82;

/**
 * CSS for one glyph on cream/light cards: same P×S→glow/stroke as dark UI, but opacity floor for contrast.
 */
export function glyphCssFromHexAndPxS(
  hex7: string,
  pDisplay: number,
  sDisplay: number,
  fontSizePx: number,
): LightGlyphCss {
  const rgb = punchRgbForDisplay(hexToRgb(hex7), 1.22);
  const vs = visualStyleFromPxS(mapPForRender(pDisplay), mapSForRender(sDisplay), rgb, fontSizePx);
  const opacity = Math.max(LIGHT_BG_MIN_OPACITY, vs.fillAlpha);
  const textShadow = `${vs.shadowBlur > 0.5 ? `0 0 ${vs.shadowBlur.toFixed(1)}px ${vs.shadowColor}, ` : ""}0 1px 0 rgba(255,255,255,0.55)`;
  const WebkitTextStroke =
    vs.strokeStyle && vs.strokeWidth > 0 ? `${vs.strokeWidth * 0.35}px ${vs.strokeStyle}` : undefined;
  const blurPx = Math.max(0, (clamp01(sDisplay) - 0.55) * 2.2);
  const filter = blurPx > 0.08 ? `blur(${blurPx.toFixed(2)}px)` : undefined;
  return {
    color: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
    opacity,
    textShadow,
    WebkitTextStroke,
    filter,
  };
}
