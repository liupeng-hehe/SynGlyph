import type { LetterPredictionEntry } from "@/lib/modelFeedbackTypes";
import type { RGB } from "@/lib/textRevealCanvasUtils";
import { rgbToHex } from "@/lib/textRevealCanvasUtils";

const DEFAULT_PS = 0.5;

/** One entry per Unicode letter in [start,end] with model (or fallback) color + P×S from letter-sequence heads. */
export function letterPredictionsInSpan(
  text: string,
  start: number,
  end: number,
  rgbByCharIndex: RGB[] | null,
  letterColorsFallback: RGB[],
  charMap: number[],
  predProm: number[] | null,
  predSpr: number[] | null
): LetterPredictionEntry[] {
  const out: LetterPredictionEntry[] = [];
  for (let i = start; i <= end; i++) {
    const li = charMap[i] ?? -1;
    if (li < 0) continue;
    const c = rgbByCharIndex?.[i] ?? letterColorsFallback[li];
    if (!c) continue;
    const prom =
      predProm && predProm.length === text.length ? clamp01(predProm[i] ?? DEFAULT_PS) : DEFAULT_PS;
    const spr = predSpr && predSpr.length === text.length ? clamp01(predSpr[i] ?? DEFAULT_PS) : DEFAULT_PS;
    out.push({
      charIndex: i,
      char: text[i] ?? "",
      hex: rgbToHex(c.r, c.g, c.b),
      prominence: prom,
      spread: spr,
    });
  }
  return out;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function averagePxSForLettersInSpan(
  text: string,
  start: number,
  end: number,
  charMap: number[],
  predProm: number[] | null,
  predSpr: number[] | null
): { prominence: number; spread: number } | null {
  if (!predProm || !predSpr || predProm.length !== text.length || predSpr.length !== text.length) return null;
  let np = 0,
    ns = 0,
    pSum = 0,
    sSum = 0;
  for (let i = start; i <= end; i++) {
    const li = charMap[i] ?? -1;
    if (li < 0) continue;
    pSum += clamp01(predProm[i] ?? 0.5);
    sSum += clamp01(predSpr[i] ?? 0.5);
    np++;
    ns++;
  }
  if (np === 0) return null;
  return { prominence: pSum / np, spread: sSum / ns };
}

export function hexForCharIndex(
  text: string,
  charIndex: number,
  rgbByCharIndex: RGB[] | null,
  letterColorsFallback: RGB[],
  charMap: number[]
): string | null {
  const li = charMap[charIndex] ?? -1;
  if (li < 0) return null;
  const c = rgbByCharIndex?.[charIndex] ?? letterColorsFallback[li];
  if (!c) return null;
  return rgbToHex(c.r, c.g, c.b);
}

export function pxSForCharIndex(
  charIndex: number,
  textLen: number,
  predProm: number[] | null,
  predSpr: number[] | null
): { prominence: number; spread: number } | null {
  if (!predProm || !predSpr || predProm.length !== textLen || predSpr.length !== textLen) return null;
  if (charIndex < 0 || charIndex >= textLen) return null;
  return {
    prominence: clamp01(predProm[charIndex] ?? 0.5),
    spread: clamp01(predSpr[charIndex] ?? 0.5),
  };
}
