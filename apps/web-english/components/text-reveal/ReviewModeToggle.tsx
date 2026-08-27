"use client";

import type { ReviewMode } from "@/lib/modelFeedbackTypes";

const MODES: { id: ReviewMode; label: string; hint: string }[] = [
  { id: "preview", label: "Preview", hint: "View model output only" },
  { id: "evaluate", label: "Evaluate", hint: "Mark tokens right/wrong" },
];

export function ReviewModeToggle({
  value,
  onChange,
}: {
  value: ReviewMode;
  onChange: (m: ReviewMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-zinc-600">Review mode</span>
      <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.hint}
            onClick={() => onChange(m.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
              value === m.id ? "bg-white text-sky-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
