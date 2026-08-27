"use client";

type Props = {
  onDownload: () => void;
  disabled?: boolean;
};

export function ExportControls({ onDownload, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-byo-ink/15 pt-4">
      <button
        type="button"
        disabled={disabled}
        onClick={onDownload}
        className="rounded-full bg-byo-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Download PDF
      </button>
    </div>
  );
}
