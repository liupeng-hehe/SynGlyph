"use client";

import { StippledLetter } from "@/components/studio/StippledLetter";
import type { LetterColor } from "@/lib/types";

function displayName(lc: LetterColor): string {
  return lc.customColorName ?? lc.suggestedColorName;
}

type Props = {
  letterColor: LetterColor;
  onClickCard: () => void;
};

export function LetterColorCard({ letterColor: lc, onClickCard }: Props) {
  return (
    <button
      type="button"
      onClick={onClickCard}
      className="flex min-h-0 aspect-[4/5] w-full flex-col overflow-hidden rounded-2xl text-left shadow-lg ring-1 ring-byo-ink/10 transition hover:ring-byo-ink/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-byo-ink"
      style={{ backgroundColor: lc.hex }}
      aria-label={`Letter ${lc.letter}, ${displayName(lc)}, ${lc.hex}`}
    >
      {/* Flex column keeps a real laid-out height chain (absolute children do not contribute to flex sizing). */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col px-2 pb-4 pt-2"
        style={{ minHeight: "7rem" }}
      >
        <StippledLetter
          letter={lc.letter}
          backgroundHex={lc.hex}
          glyphScale={2}
          translateYPx={5}
          variant="hero"
          className="h-full w-full min-h-[5rem] flex-1"
        />
      </div>

      {/* Inline gradient + text color so footer stays readable even if Tailwind/CSS fails to load */}
      <div
        className="relative z-[1] shrink-0 px-2 pb-2 pt-3 backdrop-blur-[8px]"
        style={{
          borderTop: "1px solid rgba(0,0,0,0.12)",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.48) 50%, transparent 100%)",
          color: "#ffffff",
        }}
      >
        <div
          className="flex flex-col gap-1 text-left leading-tight"
          style={{ color: "#ffffff" }}
        >
          <p
            className="flex min-w-0 items-baseline gap-1 font-display font-semibold tracking-tight"
            style={{ color: "#ffffff", fontSize: "15px" }}
          >
            <span className="shrink-0 tabular-nums" style={{ opacity: 0.96 }}>
              {lc.letter}.
            </span>
            <span className="min-w-0 truncate">{displayName(lc)}</span>
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
