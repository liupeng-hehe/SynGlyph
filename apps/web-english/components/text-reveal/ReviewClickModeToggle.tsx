"use client";

import type { SpanClickMode } from "@/lib/modelFeedbackTypes";

export function ReviewClickModeToggle({
  value,
  onChange,
}: {
  value: SpanClickMode;
  onChange: (m: SpanClickMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-zinc-600">Canvas click</span>
      <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
        <button
          type="button"
          title="Select whole word"
          onClick={() => onChange("word")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
            value === "word" ? "bg-white text-sky-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Word
        </button>
        <button
          type="button"
          title="Select one letter (word outline + letter highlight)"
          onClick={() => onChange("letter")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
            value === "letter" ? "bg-white text-sky-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Letter
        </button>
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Letter mode: click a character to focus it; correct colors per letter below when error is Wrong color.
      </p>
    </div>
  );
}
