"use client";

import type { CSSProperties, ReactNode } from "react";

import { passageContrastRimStyle } from "@/lib/colorStudio/passageContrastRim";
import { BYO_INK } from "@/lib/colorStudio/byoTheme";
import {
  passageFilledLetterStyle,
  passageFrameInnerStyle,
  passageFrameOuterStyle,
  type PassageLetterVisualMode,
} from "@/lib/colorStudio/passageLetterVisual";
import type { PassageGlyph } from "@/lib/colorStudio/passageRender";

/** Space between words (em). */
const WORD_GAP_EM = 0.46;
/** Max extra space between letters inside one word (D), kept subtle. */
const INTRA_WORD_D_MAX_EM = 0.035;

type Props = {
  glyphs: PassageGlyph[];
  backgroundHex: string;
  visualMode?: PassageLetterVisualMode;
  className?: string;
};

function isLetterGlyph(text: string): boolean {
  return /^[a-zA-Z]$/.test(text);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function renderLetterSpan(
  tok: PassageGlyph,
  idx: number,
  j: number,
  wordSlotsLength: number,
  backgroundHex: string,
  visualMode: PassageLetterVisualMode,
): ReactNode {
  const hasNextInWord = j < wordSlotsLength - 1;
  const marginStyle: CSSProperties =
    hasNextInWord && isLetterGlyph(tok.text) && tok.boundaryAfter !== undefined
      ? { marginRight: `${clamp01(tok.boundaryAfter) * INTRA_WORD_D_MAX_EM}em` }
      : {};

  if (visualMode === "frame" && isLetterGlyph(tok.text)) {
    return (
      <span
        key={idx}
        className="relative inline-block align-baseline"
        style={marginStyle}
      >
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
          <span
            aria-hidden
            className="block whitespace-nowrap"
            style={passageFrameOuterStyle(tok.hex, tok.prominence, tok.spread)}
          >
            {tok.text}
          </span>
        </span>
        <span
          className="relative z-[1] inline-block whitespace-nowrap"
          style={{
            ...passageFrameInnerStyle(),
            ...passageContrastRimStyle(BYO_INK, backgroundHex),
          }}
        >
          {tok.text}
        </span>
      </span>
    );
  }

  const style: CSSProperties = {
    ...passageFilledLetterStyle(tok.hex, tok.prominence, tok.spread),
    ...(isLetterGlyph(tok.text)
      ? passageContrastRimStyle(tok.hex, backgroundHex)
      : {}),
    display: "inline-block",
    verticalAlign: "baseline",
    ...marginStyle,
  };

  return (
    <span key={idx} style={style}>
      {tok.text}
    </span>
  );
}

/**
 * Passage letters — fill (palette in glyph) or frame (palette+P×S as outer halo).
 */
export function PassageReadingView({
  glyphs,
  backgroundHex,
  visualMode = "fill",
  className,
}: Props) {
  if (!glyphs.length) return null;

  const parts: ReactNode[] = [];
  let i = 0;
  let seq = 0;

  while (i < glyphs.length) {
    const g = glyphs[i]!;
    if (/^\s+$/.test(g.text)) {
      while (i < glyphs.length && /^\s+$/.test(glyphs[i]!.text)) {
        i++;
      }
      parts.push(
        <span
          key={`gap-${seq++}`}
          className="inline-block align-baseline"
          style={{ width: `${WORD_GAP_EM}em` }}
          aria-hidden
        />,
      );
      continue;
    }

    const wordStart = i;
    const wordSlots: { g: PassageGlyph; idx: number }[] = [];
    while (i < glyphs.length && !/^\s+$/.test(glyphs[i]!.text)) {
      wordSlots.push({ g: glyphs[i]!, idx: i });
      i++;
    }

    parts.push(
      <span
        key={`wd-${wordStart}`}
        className="inline-block whitespace-nowrap align-baseline"
      >
        {wordSlots.map(({ g: tok, idx }, j) =>
          renderLetterSpan(
            tok,
            idx,
            j,
            wordSlots.length,
            backgroundHex,
            visualMode,
          ),
        )}
      </span>,
    );
  }

  return (
    <span className={className} style={{ wordBreak: "break-word" }}>
      {parts}
    </span>
  );
}
