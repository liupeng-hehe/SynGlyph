"use client";

type Props = {
  onDownloadPdf: () => void;
  onDownloadPng: () => void;
  disabled?: boolean;
};

export function ExportControls({
  onDownloadPdf,
  onDownloadPng,
  disabled,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-byo-ink/15 pt-4">
      <button
        type="button"
        disabled={disabled}
        onClick={onDownloadPdf}
        className="rounded-full bg-byo-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Download PDF
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDownloadPng}
        className="rounded-full bg-byo-ink/10 px-5 py-2.5 text-sm font-medium text-byo-ink hover:bg-byo-ink/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Download PNG
      </button>
    </div>
  );
}
