import type { LetterPredictionEntry } from "@/lib/modelFeedbackTypes";
import type { MigrationLeanByLeftIndex } from "@/components/text-reveal/LetterBoundaryMigrationEval";
import { hexToRgb, punchRgbForDisplay, type RGB } from "@/lib/textRevealCanvasUtils";

function clampLean11(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

function punchPreview(hex: string): RGB {
  return punchRgbForDisplay(hexToRgb(hex), 1.34);
}

/**
 * Edits row: migration lean in [-1,1] maps to full lerp weight at ±1 (preview only; colorEdits unchanged).
 * Boundary (left|right) keyed by left letter: L=-1 → right letter is 100% left color; L=+1 → left letter is 100% right color.
 */
export function editsRowPreviewRgb(
  rows: LetterPredictionEntry[],
  colorEdits: Record<number, string>,
  migrationEval: MigrationLeanByLeftIndex | undefined,
  letterIndex: number
): RGB {
  const r = rows[letterIndex]!;
  let rgb = punchPreview(colorEdits[r.charIndex] ?? r.hex);
  if (!migrationEval || rows.length < 2) return rgb;

  if (letterIndex > 0) {
    const left = rows[letterIndex - 1]!;
    const L = clampLean11(migrationEval[left.charIndex]?.lean ?? 0);
    if (L < 0) {
      const rgbL = punchPreview(colorEdits[left.charIndex] ?? left.hex);
      rgb = lerpRgb(rgb, rgbL, -L);
    }
  }
  if (letterIndex < rows.length - 1) {
    const right = rows[letterIndex + 1]!;
    const L = clampLean11(migrationEval[r.charIndex]?.lean ?? 0);
    if (L > 0) {
      const rgbR = punchPreview(colorEdits[right.charIndex] ?? right.hex);
      rgb = lerpRgb(rgb, rgbR, L);
    }
  }
  return rgb;
}
