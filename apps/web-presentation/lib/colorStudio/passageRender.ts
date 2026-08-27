import type { LetterColor } from "./types";

export type PassageGlyph = {
  text: string;
  hex: string;
  prominence: number;
  spread: number;
  boundaryAfter?: number;
};

export type LabRenderToken = {
  text: string;
  fill: string;
  prominence?: number;
  spread?: number;
  boundary_after?: number;
};

const DEFAULT_P = 0.62;
const DEFAULT_S = 0.38;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function relLuminance(hex: string): number {
  const h = hex.replace("#", "").padStart(6, "0").slice(0, 6);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function boundaryBetween(hexA: string, hexB: string): number {
  const la = relLuminance(hexA);
  const lb = relLuminance(hexB);
  return clamp01(0.38 + Math.abs(la - lb) * 0.55);
}

function letterByChar(letters: LetterColor[]): Map<string, LetterColor> {
  const m = new Map<string, LetterColor>();
  for (const lc of letters) m.set(lc.letter.toUpperCase(), lc);
  return m;
}

export function glyphsFromLabTokens(tokens: LabRenderToken[]): PassageGlyph[] {
  return tokens.map((t) => ({
    text: t.text,
    hex: t.fill,
    prominence: t.prominence ?? DEFAULT_P,
    spread: t.spread ?? DEFAULT_S,
    boundaryAfter: t.boundary_after,
  }));
}

/** Local fallback: palette hex + per-letter P/S; boundary from luminance contrast. */
export function glyphsFromPassageAndLetters(
  passage: string,
  letters: LetterColor[],
  neutralColor = "#57534E",
): PassageGlyph[] {
  const byLetter = letterByChar(letters);
  const glyphs: PassageGlyph[] = [];

  for (let i = 0; i < passage.length; i++) {
    const ch = passage[i]!;
    if (/[a-zA-Z]/.test(ch)) {
      const lc = byLetter.get(ch.toUpperCase());
      const hex = lc?.hex ?? "#57534E";
      const nextCh = passage[i + 1];
      const nextHex =
        nextCh && /[a-zA-Z]/.test(nextCh)
          ? byLetter.get(nextCh.toUpperCase())?.hex ?? hex
          : null;
      glyphs.push({
        text: ch,
        hex,
        prominence: lc?.prominence ?? DEFAULT_P,
        spread: lc?.spread ?? DEFAULT_S,
        boundaryAfter:
          nextCh && /[a-zA-Z]/.test(nextCh) && nextHex
            ? boundaryBetween(hex, nextHex)
            : undefined,
      });
    } else {
      glyphs.push({
        text: ch,
        hex: neutralColor,
        prominence: 0.5,
        spread: 0.35,
      });
    }
  }
  return glyphs;
}

/** PDF export: merge adjacent same-style runs where possible. */
export type PdfGlyphRun = {
  text: string;
  hex: string;
  fontWeight: number;
  marginRight?: number;
};

export function pdfRunsFromGlyphs(glyphs: PassageGlyph[]): PdfGlyphRun[] {
  const runs: PdfGlyphRun[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i]!;
    const fw = Math.round(400 + clamp01(g.prominence) * 500);
    const marginRight =
      g.boundaryAfter !== undefined && i + 1 < glyphs.length
        ? 2 + clamp01(g.boundaryAfter) * 6
        : undefined;
    const prev = runs[runs.length - 1];
    if (
      prev &&
      prev.hex === g.hex &&
      prev.fontWeight === fw &&
      prev.marginRight === marginRight
    ) {
      prev.text += g.text;
    } else {
      runs.push({ text: g.text, hex: g.hex, fontWeight: fw, marginRight });
    }
  }
  return runs.length ? runs : [{ text: " ", hex: "#57534E", fontWeight: 400 }];
}
