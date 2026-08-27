"use client";

const PRESETS = [
  "melancholic",
  "luminous",
  "calm",
  "fierce",
  "tender",
  "mysterious",
  "restless",
  "fresh",
  "nostalgic",
  "warm",
];

type Props = {
  feelings: string[];
  customInput: string;
  onTogglePreset: (word: string) => void;
  onCustomInputChange: (value: string) => void;
  onAddCustom: () => void;
};

export function FeelingSelector({
  feelings,
  customInput,
  onTogglePreset,
  onCustomInputChange,
  onAddCustom,
}: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-byo-ink">Feeling words</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((w) => {
          const active = feelings.includes(w);
          return (
            <button
              key={w}
              type="button"
              onClick={() => onTogglePreset(w)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                active
                  ? "bg-byo-ink text-white shadow-sm"
                  : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
              }`}
            >
              {w}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={customInput}
          onChange={(e) => onCustomInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddCustom();
            }
          }}
          placeholder="Custom feeling…"
          className="min-w-[12rem] flex-1 rounded-xl border border-byo-ink/20 bg-white px-3 py-2 text-sm text-byo-ink outline-none placeholder:text-byo-ink/40 focus:border-byo-ink/50"
        />
        <button
          type="button"
          onClick={onAddCustom}
          className="rounded-xl bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
        >
          Add
        </button>
      </div>
      {feelings.length > 0 ? (
        <p className="text-xs text-byo-ink/65">
          Selected: {feelings.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
