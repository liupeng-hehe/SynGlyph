import type { CSSProperties } from "react";

import {
  annotateWordLetterStyle,
  hexWithHash,
} from "@/lib/annotateCharColors";
import { BYO_INK } from "@/lib/colorStudio/byoTheme";

export type PassageLetterVisualMode = "fill" | "frame";

export const PASSAGE_LETTER_VISUAL_OPTIONS: {
  value: PassageLetterVisualMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "fill",
    label: "Fill",
    hint: "Letter body filled with palette color + P×S glow",
  },
  {
    value: "frame",
    label: "Frame",
    hint: "Palette color + P×S as a thin outer rim around the letter",
  },
];

/** Mode 1: annotated color fills the glyph (current passage preview). */
export function passageFilledLetterStyle(
  hex: string,
  prominence: number,
  spread: number,
): CSSProperties {
  return annotateWordLetterStyle(hex, prominence, spread, {
    wordRow: true,
    passagePreview: true,
  });
}

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const h = hexWithHash(hex).slice(1).padStart(6, "0");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Mode 2: palette color + P×S as a thin outer rim (letter stays ink).
 * No bloom or wide blur — just a crisp stroke with a hair of edge softening from S.
 */
export function passageFrameOuterStyle(
  hex: string,
  prominence: number,
  spread: number,
): CSSProperties {
  const h = hexWithHash(hex);
  const p = Math.max(0, Math.min(1, prominence));
  const s = Math.max(0, Math.min(1, spread));
  const { r, g, b } = rgbFromHex(h);

  /** Thin rim: ~0.5–1.25px; P makes it slightly more present, not wider. */
  const strokePx = 0.5 + p * 0.45 + s * 0.18;
  /** P = clearer rim; S = only a whisper of edge softness (≤1px). */
  const rimOpacity = Math.min(0.94, 0.68 + p * 0.24 - s * 0.06);
  const edgeSoftPx = s * 0.85 + p * 0.15;
  const textShadow =
    edgeSoftPx >= 0.2
      ? `0 0 ${edgeSoftPx.toFixed(2)}px rgba(${r},${g},${b},${(0.12 + p * 0.1).toFixed(3)})`
      : undefined;

  return {
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: `${strokePx.toFixed(2)}px ${h}`,
    paintOrder: "stroke fill",
    opacity: rimOpacity,
    textShadow,
  };
}

/** Inner glyph for frame mode — neutral ink body. */
export function passageFrameInnerStyle(): CSSProperties {
  return {
    color: BYO_INK,
    opacity: 1,
    textShadow: "0 0 0.45px rgba(0,47,167,0.12)",
    filter: undefined,
  };
}

export function isPassageLetterVisualMode(v: string): v is PassageLetterVisualMode {
  return v === "fill" || v === "frame";
}
