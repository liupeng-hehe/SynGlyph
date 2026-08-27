"use client";

import type { SelectedSpanPayload } from "@/lib/modelFeedbackTypes";

export function WordEvaluateEntry({
  span,
  disabled,
  onOpen,
}: {
  span: SelectedSpanPayload | null;
  disabled?: boolean;
  onOpen: () => void;
}) {
  if (!span) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="rounded-full border border-sky-300/60 bg-sky-500/20 px-3 py-1 text-[11px] font-medium text-sky-100 backdrop-blur hover:bg-sky-500/30 disabled:opacity-50"
    >
      Evaluate "{span.selectedText || "word"}"
    </button>
  );
}

