"use client";

import type { SuggestedTextColor } from "@/lib/colorStudio/types";

type Props = {
  rawHex: string;
  renderedHex: string;
  intensityPercent: number;
  suggestion: SuggestedTextColor | null;
  applied: boolean;
};

function Swatch({
  label,
  hex,
  large,
}: {
  label: string;
  hex: string;
  large?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-byo-ink/55">
        {label}
      </p>
      <div
        className={`mt-1.5 w-full rounded-xl border border-byo-ink/15 shadow-sm ${
          large ? "h-24" : "h-16"
        }`}
        style={{ backgroundColor: hex }}
        aria-label={`${label} color ${hex}`}
      />
      <p className="mt-1.5 font-mono text-[11px] text-byo-ink/80">{hex}</p>
    </div>
  );
}

export function BackgroundColorPanel({
  rawHex,
  renderedHex,
  intensityPercent,
  suggestion,
  applied,
}: Props) {
  const suggestionName =
    suggestion?.customColorName ?? suggestion?.suggestedColorName ?? null;

  return (
    <section className="space-y-3 rounded-2xl border border-byo-ink/15 bg-white/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-byo-ink">
          Background color
        </h3>
        {applied ? (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
            Applied to preview
          </span>
        ) : suggestion ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Suggested — click Use this color
          </span>
        ) : null}
      </div>

      <div className="flex gap-3">
        <Swatch label="Raw wash" hex={rawHex} large />
        <Swatch
          label={`Rendered (${intensityPercent}% intensity)`}
          hex={renderedHex}
          large
        />
      </div>

      {suggestionName ? (
        <p className="text-xs text-byo-ink/70">
          {applied ? "Active" : "Latest suggestion"}:{" "}
          <span className="font-medium text-byo-ink">{suggestionName}</span>
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-byo-ink/55">
        Passage letters use prominence (weight/glow), spread (softness), and boundary spacing —
        from your BYO model when linked, otherwise from your anchored letter P×S.
      </p>
    </section>
  );
}
