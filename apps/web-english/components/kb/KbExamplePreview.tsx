"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { KbSegmentItem } from "@/lib/kbApi";

type KbExamplePreviewProps = {
  open: boolean;
  title: string;
  loading: boolean;
  error: string | null;
  items: KbSegmentItem[];
  onClose: () => void;
};

export function KbExamplePreview({ open, title, loading, error, items, onClose }: KbExamplePreviewProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-preview-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h3 id="kb-preview-title" className="text-sm font-medium text-zinc-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4 text-sm">
          {loading && <p className="text-zinc-500">Loading…</p>}
          {error && <p className="text-red-300/90">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-zinc-500">No matching examples in this KB slice.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((it) => (
                <li key={`${it.kb_word_id}-${it.segment.id}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="font-medium text-zinc-200">{it.normalized_word}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.stimulus_id ? (
                      <Link
                        href={`/annotate/${it.stimulus_id}`}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        Open annotation
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-500">No stimulus link</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
