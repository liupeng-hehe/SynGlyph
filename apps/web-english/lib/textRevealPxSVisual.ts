import type { RGB } from "@/lib/textRevealCanvasUtils";

/**
 * Visual mapping from letter-sequence heads (0–1) to canvas hints.
 * - Prominence → stronger presence: fill alpha + optional stroke “weight”.
 * - Spread → softer / more diffuse: colored shadow blur (glow), not the UI spotlight.
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Display-only: map raw spread so former 0–0.5 “feel” fills 0–1 (1.0 was too strong). */
export function remapSpreadForVisual(spread: number): number {
  return Math.min(1, 2 * clamp01(spread));
}

/** Display-only: stretch 0.3–1.0 model prominence across full 0–1 visual range. */
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
  /** Wider alpha range so low-P letters visibly recede (annotation “migration” feel). */
  const fillAlpha = 0.08 + 0.92 * p;
  /** Stronger bloom: spread maps to large blur + bright halo. */
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
