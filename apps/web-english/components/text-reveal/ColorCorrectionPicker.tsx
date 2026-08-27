"use client";

import { QUALITATIVE_TAGS } from "@/lib/modelFeedbackTypes";

export function ColorCorrectionPicker({
  currentHex,
  correctedHex,
  onCorrectedHexChange,
  tags,
  onToggleTag,
}: {
  currentHex: string;
  correctedHex: string;
  onCorrectedHexChange: (hex: string) => void;
  tags: Set<string>;
  onToggleTag: (tag: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2">
      <div className="text-[11px] font-medium text-sky-950">Color correction</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">Current</span>
          <span
            className="inline-block h-8 w-12 rounded border border-zinc-300"
            style={{ backgroundColor: currentHex }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">Corrected</span>
          <input
            type="color"
            value={correctedHex}
            onChange={(e) => onCorrectedHexChange(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
            aria-label="Corrected color"
          />
          <span
            className="inline-block h-8 w-12 rounded border border-zinc-300"
            style={{ backgroundColor: correctedHex }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] text-zinc-500">Quick tags</div>
        <div className="flex flex-wrap gap-1">
          {QUALITATIVE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onToggleTag(t)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                tags.has(t) ? "bg-sky-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
