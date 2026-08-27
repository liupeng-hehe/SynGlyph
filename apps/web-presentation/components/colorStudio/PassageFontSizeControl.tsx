"use client";

import {
  clampPassageFontSize,
  PASSAGE_FONT_SIZE_MAX,
  PASSAGE_FONT_SIZE_MIN,
} from "@/lib/colorStudio/passageBoxes";

const PRESETS = [
  { label: "S", size: 14 },
  { label: "M", size: 18 },
  { label: "L", size: 24 },
  { label: "XL", size: 32 },
] as const;

type Props = {
  fontSize: number;
  onChange: (fontSize: number) => void;
  compact?: boolean;
};

export function PassageFontSizeControl({
  fontSize,
  onChange,
  compact = false,
}: Props) {
  const size = clampPassageFontSize(fontSize);

  function step(delta: number) {
    onChange(clampPassageFontSize(size + delta));
  }

  if (compact) {
    return (
      <div
        data-box-chrome
        className="flex items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Smaller text"
          onClick={() => step(-1)}
          disabled={size <= PASSAGE_FONT_SIZE_MIN}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-byo-ink/70 hover:bg-byo-ink/10 disabled:opacity-35"
        >
          A−
        </button>
        <span className="min-w-[2.25rem] text-center text-[10px] font-medium tabular-nums text-byo-ink/60">
          {size}px
        </span>
        <button
          type="button"
          aria-label="Larger text"
          onClick={() => step(1)}
          disabled={size >= PASSAGE_FONT_SIZE_MAX}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-byo-ink/70 hover:bg-byo-ink/10 disabled:opacity-35"
        >
          A+
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-byo-ink/70">Font size</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease font size"
            onClick={() => step(-1)}
            disabled={size <= PASSAGE_FONT_SIZE_MIN}
            className="rounded-lg bg-byo-ink/10 px-2.5 py-1 text-xs font-semibold text-byo-ink hover:bg-byo-ink/15 disabled:opacity-35"
          >
            −
          </button>
          <input
            type="number"
            min={PASSAGE_FONT_SIZE_MIN}
            max={PASSAGE_FONT_SIZE_MAX}
            value={size}
            onChange={(e) => onChange(clampPassageFontSize(Number(e.target.value)))}
            className="w-14 rounded-lg border border-byo-ink/20 bg-white px-2 py-1 text-center text-xs tabular-nums text-byo-ink outline-none focus:border-byo-ink/50"
          />
          <span className="text-[11px] text-byo-ink/50">px</span>
          <button
            type="button"
            aria-label="Increase font size"
            onClick={() => step(1)}
            disabled={size >= PASSAGE_FONT_SIZE_MAX}
            className="rounded-lg bg-byo-ink/10 px-2.5 py-1 text-xs font-semibold text-byo-ink hover:bg-byo-ink/15 disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>

      <input
        type="range"
        min={PASSAGE_FONT_SIZE_MIN}
        max={PASSAGE_FONT_SIZE_MAX}
        value={size}
        onChange={(e) => onChange(clampPassageFontSize(Number(e.target.value)))}
        className="w-full"
      />

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.size)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              size === preset.size
                ? "bg-byo-ink text-white"
                : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
            }`}
          >
            {preset.label} · {preset.size}
          </button>
        ))}
      </div>
    </div>
  );
}
