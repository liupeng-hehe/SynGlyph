"use client";

type Props = {
  passage: string;
  onChange: (value: string) => void;
};

export function TextInputPanel({ passage, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-byo-ink">
        Your passage
      </label>
      <textarea
        value={passage}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="Paste or type the text you want on the PDF…"
        className="w-full resize-y rounded-xl border border-byo-ink/20 bg-white px-4 py-3 font-body text-sm text-byo-ink outline-none placeholder:text-byo-ink/40 focus:border-byo-ink/50"
      />
    </div>
  );
}
