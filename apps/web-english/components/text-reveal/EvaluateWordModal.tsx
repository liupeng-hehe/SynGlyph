"use client";

import { FeedbackForm } from "@/components/text-reveal/FeedbackForm";
import type { FeedbackPayload, LetterPredictionEntry, ReviewMode, SaveMode, SelectedSpanPayload } from "@/lib/modelFeedbackTypes";

export function EvaluateWordModal({
  open,
  span,
  predictedHex,
  avgProminence,
  avgSpread,
  letterPredictions,
  reviewMode,
  onClose,
  onSave,
}: {
  open: boolean;
  span: SelectedSpanPayload | null;
  predictedHex: string;
  avgProminence: number | null;
  avgSpread: number | null;
  letterPredictions: LetterPredictionEntry[];
  reviewMode: ReviewMode;
  onClose: () => void;
  onSave: (saveMode: SaveMode, feedback: FeedbackPayload) => Promise<void>;
}) {
  if (!open || !span) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close evaluate modal"
      />
      <div className="relative z-[121] max-h-[92vh] w-[min(1000px,96vw)] overflow-y-auto rounded-2xl border border-white/15 bg-[#131520]/95 p-4 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Evaluate Word</div>
            <div className="font-mono text-3xl font-semibold tracking-wide text-white">{span.selectedText || "—"}</div>
            <div className="mt-1 text-[11px] text-zinc-400">
              Pred {predictedHex}
              {avgProminence != null && avgSpread != null ? ` · P ${avgProminence.toFixed(3)} · S ${avgSpread.toFixed(3)}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {letterPredictions.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] text-zinc-300">Model letters</div>
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-lg">
              {letterPredictions.map((lp) => (
                <span key={lp.charIndex} style={{ color: lp.hex }}>
                  {lp.char}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-white/10 bg-white px-3 py-3 text-zinc-900">
          <FeedbackForm
            selectedSpan={span}
            predictedHex={predictedHex}
            letterPredictions={letterPredictions}
            focusCharIndex={span.focusCharIndex}
            reviewMode={reviewMode}
            onSave={onSave}
            disabled={!span}
          />
        </div>
      </div>
    </div>
  );
}

