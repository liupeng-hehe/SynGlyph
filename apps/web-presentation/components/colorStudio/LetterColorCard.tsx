"use client";

import { memo } from "react";

import { StippledLetter } from "@/components/colorStudio/StippledLetter";
import { LETTER_CARD_FOOTER_GRADIENT } from "@/lib/colorStudio/letterCardFooter";
import type { LetterColor } from "@/lib/colorStudio/types";

function displayName(lc: LetterColor): string {
  return lc.customColorName ?? lc.suggestedColorName;
}

type Props = {
  letterColor: LetterColor;
  onClickCard: () => void;
};

function LetterColorCardInner({ letterColor: lc, onClickCard }: Props) {
  return (
    <button
      type="button"
      onClick={onClickCard}
      className="flex min-h-0 aspect-[4/5] w-full flex-col overflow-hidden rounded-2xl text-left shadow-lg ring-1 ring-byo-ink/10 transition hover:ring-byo-ink/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-byo-ink"
      style={{ backgroundColor: lc.hex }}
      aria-label={`Letter ${lc.letter}, ${displayName(lc)}, ${lc.hex}`}
    >
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col px-2 pb-4 pt-2"
        style={{ minHeight: "7rem" }}
      >
        <StippledLetter
          letter={lc.letter}
          backgroundHex={lc.hex}
          glyphScale={2}
          translateYPx={10}
          variant="hero"
          density="compact"
          eager
          className="h-full w-full min-h-[5rem] flex-1"
        />
      </div>

      <div
        data-letter-card-footer
        className="relative z-[1] shrink-0 px-2 pb-2 pt-3 backdrop-blur-[8px]"
        style={{
          borderTop: "1px solid rgba(0,0,0,0.12)",
          background: LETTER_CARD_FOOTER_GRADIENT,
          color: "#ffffff",
        }}
      >
        <div
          className="flex min-h-[3.25rem] flex-col gap-1 text-left leading-tight"
          style={{ color: "#ffffff" }}
        >
          <p
            className="min-w-0 font-display font-semibold tracking-tight"
            style={{ color: "#ffffff", fontSize: "15px", lineHeight: 1.25 }}
          >
            <span className="tabular-nums" style={{ opacity: 0.96 }}>
              {lc.letter}.
            </span>{" "}
            <span className="break-words">{displayName(lc)}</span>
          </p>
          <p
            className="font-mono tabular-nums"
            style={{ color: "rgba(255,255,255,0.96)", fontSize: "11px" }}
          >
            {lc.hex}
          </p>
          <p
            className="font-mono tabular-nums"
            style={{ color: "rgba(255,255,255,0.88)", fontSize: "10px" }}
          >
            L*a*b* {lc.lab.l.toFixed(1)} {lc.lab.a.toFixed(1)} {lc.lab.b.toFixed(1)}
          </p>
        </div>
      </div>
    </button>
  );
}

export const LetterColorCard = memo(LetterColorCardInner);
