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
  onRemoveFeeling: (word: string) => void;
  onClearFeelings: () => void;
  onCustomInputChange: (value: string) => void;
  onAddCustom: () => void;
};

export function FeelingSelector({
  feelings,
  customInput,
  onTogglePreset,
  onRemoveFeeling,
  onClearFeelings,
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-byo-ink/65">Selected:</span>
          {feelings.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onRemoveFeeling(w)}
              className="inline-flex items-center gap-1 rounded-full bg-byo-ink/10 py-1 pl-2.5 pr-2 text-xs capitalize text-byo-ink hover:bg-byo-ink/15"
              aria-label={`Remove ${w}`}
            >
              {w}
              <span className="text-sm leading-none text-byo-ink/55" aria-hidden>
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onClearFeelings}
            className="text-xs text-byo-ink/55 underline-offset-2 hover:text-byo-ink hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
