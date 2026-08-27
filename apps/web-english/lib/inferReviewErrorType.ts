import type { ErrorType, LetterPredictionEntry, SelectedSpanPayload } from "@/lib/modelFeedbackTypes";

function hexNorm(h: string): string {
  const s = h.trim();
  const x = s.startsWith("#") ? s : `#${s}`;
  return x.toLowerCase();
}

/** Stable “word session” key: span range can change without resetting baseline when tokenIndex is set. */
export function spanSessionKey(span: SelectedSpanPayload): string {
  if (span.tokenIndex != null) return `tok:${span.tokenIndex}`;
  return `abs:${span.start}:${span.end}:${span.selectedText}`;
}

/**
 * Infer error category from edits (no model output changed — only tagging for feedback).
 * Priority: span drift → wrong_span; any color edit → wrong_color; P/S only → wrong_intensity; else other.
 */
export function inferReviewErrorType(
  baselineSpan: { start: number; end: number } | null,
  currentSpan: SelectedSpanPayload,
  letterPredictions: LetterPredictionEntry[],
  letterEdits: Record<number, string>,
  letterPromEdits: Record<number, number>,
  letterSprEdits: Record<number, number>
): ErrorType {
  if (
    baselineSpan &&
    (currentSpan.start !== baselineSpan.start || currentSpan.end !== baselineSpan.end)
  ) {
    return "wrong_span";
  }

  let colorChanged = false;
  let pxSChanged = false;
  for (const r of letterPredictions) {
    const h = letterEdits[r.charIndex] ?? r.hex;
    if (hexNorm(h) !== hexNorm(r.hex)) colorChanged = true;
    const pe = letterPromEdits[r.charIndex] ?? r.prominence;
    const se = letterSprEdits[r.charIndex] ?? r.spread;
    if (Math.abs(pe - r.prominence) > 1e-5 || Math.abs(se - r.spread) > 1e-5) pxSChanged = true;
  }

  if (colorChanged) return "wrong_color";
  if (pxSChanged) return "wrong_intensity";
  return "other";
}

export function inferWordOnlyErrorType(predictedHex: string, correctedHex: string): ErrorType {
  if (hexNorm(correctedHex) !== hexNorm(predictedHex)) return "wrong_color";
  return "other";
}
