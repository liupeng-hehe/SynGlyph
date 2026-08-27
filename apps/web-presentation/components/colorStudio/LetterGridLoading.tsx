"use client";

import { LETTER_CARD_FOOTER_GRADIENT } from "@/lib/colorStudio/letterCardFooter";
import { SYN_GRID_EXPORT_BG } from "@/lib/colorStudio/exportGridTitleBanner";

const SKELETON_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Indeterminate bar shown while studio hydrates / masks prewarm. */
export function StudioLoadingBar() {
  return (
    <div
      className="overflow-hidden rounded-full bg-byo-ink/10"
      role="progressbar"
      aria-label="Loading color studio"
      aria-busy="true"
    >
      <div className="studio-loading-bar h-1 w-full origin-left bg-byo-ink/50" />
    </div>
  );
}

/** Blank card frames matching the live grid — no placeholder letter text. */
export function LetterGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      aria-hidden
    >
      {SKELETON_LETTERS.map((letter) => (
        <div
          key={letter}
          className="flex aspect-[4/5] w-full flex-col overflow-hidden rounded-2xl shadow-lg ring-1 ring-byo-ink/10"
          style={{ backgroundColor: SYN_GRID_EXPORT_BG }}
        >
          <div
            className="flex min-h-0 flex-1 flex-col px-2 pb-4 pt-2"
            style={{ minHeight: "7rem" }}
          />
          <div
            className="shrink-0 px-2 pb-2 pt-3"
            style={{
              borderTop: "1px solid rgba(0,0,0,0.08)",
              background: LETTER_CARD_FOOTER_GRADIENT,
            }}
          >
            <div className="flex min-h-[3.25rem] flex-col gap-2">
              <div className="h-3.5 w-[55%] rounded bg-white/15" />
              <div className="h-2.5 w-[38%] rounded bg-white/12" />
              <div className="h-2.5 w-[72%] rounded bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
