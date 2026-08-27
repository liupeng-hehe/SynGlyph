/**
 * 100-point deduction-based score for English word-level annotation review.
 * Per-letter P/S averaged; per-letter OKLab distance averaged; boundary transition averaged.
 */

import type { LetterPredictionEntry } from "@/lib/modelFeedbackTypes";

/** Same shape as LetterBoundaryMigrationEval panel state */
export type MigrationLeanState = Record<number, { lean: number }>;

export type WordReviewLabelId = "as_is" | "minor_change" | "reject";

export interface WordAnnotationReviewScore {
  score: number;
  label: WordReviewLabelId;
  /** English UI label */
  labelDisplay: "As is" | "Minor change" | "Reject";
  colorPenalty: number;
  pPenalty: number;
  sPenalty: number;
  transitionPenalty: number;
  /** Mean Euclidean distance in OKLab (for transparency) */
  meanOklabDistance: number;
  /** Mean |ΔP|, mean |ΔS| across letters */
  meanDeltaP: number;
  meanDeltaS: number;
  /** Mean |T_edit − T_pred| across boundaries; T_pred = 0 */
  meanDeltaT: number;
}

function hexNorm(h: string): string {
  const s = h.trim();
  const x = s.startsWith("#") ? s : `#${s}`;
  return x.toLowerCase();
}

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } | null {
  const h = hexNorm(hex).replace("#", "").padStart(6, "0");
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** OKLab from linear sRGB 0–1 (Björn Ottosson) */
export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.9299786846 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757666 * s_,
  };
}

export function oklabDistanceHex(hex1: string, hex2: string): number {
  const a = hexToRgb01(hex1);
  const b = hexToRgb01(hex2);
  if (!a || !b) return 0;
  const o1 = rgbToOklab(a.r, a.g, a.b);
  const o2 = rgbToOklab(b.r, b.g, b.b);
  const dL = o1.L - o2.L;
  const da = o1.a - o2.a;
  const db = o1.b - o2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function colorPenaltyFromDistance(d: number): number {
  if (d <= 0.015) return 0;
  if (d <= 0.03) return 4;
  if (d <= 0.06) return 10;
  if (d <= 0.1) return 18;
  if (d <= 0.16) return 28;
  return 40;
}

export function pPenaltyFromDelta(deltaP: number): number {
  const d = Math.abs(deltaP);
  if (d <= 0.03) return 0;
  if (d <= 0.08) return 2;
  if (d <= 0.15) return 5;
  if (d <= 0.25) return 9;
  if (d <= 0.4) return 14;
  return 20;
}

export function sPenaltyFromDelta(deltaS: number): number {
  const d = Math.abs(deltaS);
  if (d <= 0.05) return 0;
  if (d <= 0.1) return 2;
  if (d <= 0.2) return 6;
  if (d <= 0.35) return 10;
  if (d <= 0.5) return 15;
  return 20;
}

export function transitionPenaltyFromDelta(deltaT: number): number {
  const d = Math.abs(deltaT);
  if (d <= 0.1) return 0;
  if (d <= 0.2) return 2;
  if (d <= 0.35) return 5;
  if (d <= 0.6) return 10;
  if (d <= 0.9) return 15;
  return 20;
}

/** T_pred = 0 (no model boundary head in current pipeline). */
const T_PRED = 0;

function labelFromScoreAndPenalties(
  score: number,
  c: number,
  p: number,
  s: number,
  t: number
): { id: WordReviewLabelId; display: "As is" | "Minor change" | "Reject" } {
  if (c >= 28 || p === 20 || s === 20 || t === 20) {
    return { id: "reject", display: "Reject" };
  }

  if (score >= 95 && c <= 4 && p <= 2 && s <= 2 && t <= 2) {
    return { id: "as_is", display: "As is" };
  }

  if (score >= 70) {
    return { id: "minor_change", display: "Minor change" };
  }

  return { id: "reject", display: "Reject" };
}

export function computeWordAnnotationReviewScore({
  rows,
  colorEdits,
  promEdits,
  sprEdits,
  migrationEval,
}: {
  rows: LetterPredictionEntry[];
  colorEdits: Record<number, string>;
  promEdits: Record<number, number>;
  sprEdits: Record<number, number>;
  migrationEval?: MigrationLeanState;
}): WordAnnotationReviewScore {
  const n = rows.length;
  if (n === 0) {
    return {
      score: 100,
      label: "as_is",
      labelDisplay: "As is",
      colorPenalty: 0,
      pPenalty: 0,
      sPenalty: 0,
      transitionPenalty: 0,
      meanOklabDistance: 0,
      meanDeltaP: 0,
      meanDeltaS: 0,
      meanDeltaT: 0,
    };
  }

  let sumD = 0;
  let sumAbsP = 0;
  let sumAbsS = 0;
  for (const r of rows) {
    const hx = colorEdits[r.charIndex] ?? r.hex;
    sumD += oklabDistanceHex(r.hex, hx);
    const pe = promEdits[r.charIndex] ?? r.prominence;
    const se = sprEdits[r.charIndex] ?? r.spread;
    sumAbsP += Math.abs(pe - r.prominence);
    sumAbsS += Math.abs(se - r.spread);
  }

  const meanOklabDistance = sumD / n;
  const meanDeltaP = sumAbsP / n;
  const meanDeltaS = sumAbsS / n;

  const colorPenalty = colorPenaltyFromDistance(meanOklabDistance);
  const pPenalty = pPenaltyFromDelta(meanDeltaP);
  const sPenalty = sPenaltyFromDelta(meanDeltaS);

  const me = migrationEval ?? {};
  let sumAbsT = 0;
  let nB = 0;
  if (n >= 2) {
    for (let i = 0; i < n - 1; i++) {
      const left = rows[i]!;
      const lean = me[left.charIndex]?.lean ?? 0;
      const tEdit = Math.max(-1, Math.min(1, lean));
      sumAbsT += Math.abs(tEdit - T_PRED);
      nB += 1;
    }
  }
  const meanDeltaT = nB > 0 ? sumAbsT / nB : 0;
  const transitionPenalty = nB > 0 ? transitionPenaltyFromDelta(meanDeltaT) : 0;

  const rawScore = 100 - colorPenalty - pPenalty - sPenalty - transitionPenalty;
  const scoreRounded = Math.max(0, Math.min(100, Math.round(rawScore)));
  const { id: label, display: labelDisplay } = labelFromScoreAndPenalties(
    scoreRounded,
    colorPenalty,
    pPenalty,
    sPenalty,
    transitionPenalty
  );

  return {
    score: scoreRounded,
    label,
    labelDisplay,
    colorPenalty,
    pPenalty,
    sPenalty,
    transitionPenalty,
    meanOklabDistance,
    meanDeltaP,
    meanDeltaS,
    meanDeltaT,
  };
}
