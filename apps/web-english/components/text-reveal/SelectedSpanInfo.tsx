"use client";

import type { LetterPredictionEntry, SelectedSpanPayload } from "@/lib/modelFeedbackTypes";

export function SelectedSpanInfo({
  span,
  predictedHex,
  avgProminence,
  avgSpread,
  letterPredictions,
  hasSavedFeedback,
}: {
  span: SelectedSpanPayload | null;
  predictedHex: string | null;
  avgProminence: number | null;
  avgSpread: number | null;
  letterPredictions: LetterPredictionEntry[];
  hasSavedFeedback: boolean;
}) {
  if (!span) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] text-zinc-500">
        In Evaluate mode, click the canvas, then click the Evaluate button. Choose Word (whole token) or Letter (one
        letter + per-letter color edits).
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Selected span</div>
          <div className="mt-0.5 font-mono text-xs text-zinc-900">{span.selectedText || "·"}</div>
          <div className="mt-1 text-[10px] text-zinc-500">
            indices [{span.start}, {span.end}]
            {span.tokenIndex != null ? ` · token #${span.tokenIndex}` : ""}
            {span.clickMode === "letter" && span.focusCharIndex != null
              ? ` · letter @ ${span.focusCharIndex}`
              : ""}
          </div>
        </div>
        {hasSavedFeedback && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
            Saved
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500">Predicted (avg)</span>
        <span
          className="inline-block h-6 w-10 rounded border border-zinc-300 shadow-inner"
          style={{ backgroundColor: predictedHex || "#ccc" }}
          title={predictedHex || ""}
        />
        <span className="font-mono text-[11px] text-zinc-700">{predictedHex ?? "—"}</span>
      </div>
      {avgProminence != null && avgSpread != null && (
        <div className="text-[10px] text-zinc-600">
          Model P×S (avg over letters):{" "}
          <span className="font-mono">
            P {avgProminence.toFixed(3)} · S {avgSpread.toFixed(3)}
          </span>
        </div>
      )}
      {letterPredictions.length > 0 && (
        <div className="border-t border-zinc-200 pt-2">
          <div className="text-[10px] font-medium text-zinc-500">Letters (model)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {letterPredictions.map((lp) => (
              <span
                key={lp.charIndex}
                className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono text-[10px] ${
                  span.focusCharIndex === lp.charIndex ? "border-sky-400 bg-sky-50" : "border-zinc-200 bg-white"
                }`}
                title={`${lp.hex} · P ${lp.prominence.toFixed(2)} · S ${lp.spread.toFixed(2)}`}
              >
                <span className="font-semibold text-zinc-900">{lp.char}</span>
                <span
                  className="inline-block h-4 w-5 rounded-sm border border-zinc-300"
                  style={{ backgroundColor: lp.hex }}
                />
                <span className="text-[8px] text-zinc-500">
                  P{lp.prominence.toFixed(1)} S{lp.spread.toFixed(1)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
