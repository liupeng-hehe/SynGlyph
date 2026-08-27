"use client";

import type { SuggestedTextColor } from "@/lib/colorStudio/types";

function displayName(s: SuggestedTextColor): string {
  return s.customColorName ?? s.suggestedColorName;
}

type Props = {
  suggestion: SuggestedTextColor;
  retrying?: boolean;
  onTryAnother: () => void;
  onEditColor: () => void;
  onUseThisColor: () => void;
  onDismiss: () => void;
};

export function SuggestedColorPopover({
  suggestion: s,
  retrying = false,
  onTryAnother,
  onEditColor,
  onUseThisColor,
  onDismiss,
}: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-byo-ink/20 p-4 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-byo-ink/20 bg-byo-bg shadow-2xl"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-full bg-byo-ink/10 px-2 py-1 text-xs text-byo-ink hover:bg-byo-ink/15"
        >
          Close
        </button>
        <div
          className="h-36 w-full"
          style={{ backgroundColor: s.hex }}
        />
        <div className="space-y-3 p-5 text-byo-ink">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-byo-ink">
              {displayName(s)}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                s.confidence === "high"
                  ? "bg-emerald-500/15 text-emerald-800"
                  : s.confidence === "medium"
                    ? "bg-amber-500/15 text-amber-900"
                    : "bg-rose-500/15 text-rose-800"
              }`}
            >
              {s.confidence} confidence
            </span>
          </div>
          <p className="font-mono text-xs text-byo-ink/85">{s.hex}</p>
          <p className="font-mono text-xs text-byo-ink/75">
            LAB {s.lab.l.toFixed(1)} · {s.lab.a.toFixed(1)} · {s.lab.b.toFixed(1)}
          </p>
          {s.deltaE != null ? (
            <p className="text-[10px] text-byo-ink/50">ΔE {s.deltaE.toFixed(2)}</p>
          ) : null}
          <p className="text-sm leading-relaxed text-byo-ink/80">{s.description}</p>
          <p className="text-xs text-byo-ink/55">{s.reason}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={retrying}
              onClick={onTryAnother}
              className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15 disabled:opacity-50"
            >
              {retrying ? "Trying…" : "Try another"}
            </button>
            <button
              type="button"
              onClick={onEditColor}
              className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
            >
              Edit color
            </button>
            <button
              type="button"
              onClick={onUseThisColor}
              className="rounded-full bg-byo-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90"
            >
              Use this color
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
