"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  sourceNotes,
  type SourceKey,
} from "@/content/synesthesiaContent";

type Props = {
  sourceKeys?: SourceKey[];
  variant?: "default" | "editorial";
};

export function SourcesDrawer({
  sourceKeys,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const sources = (sourceKeys ?? [])
    .map((key) => ({ key, ...sourceNotes[key] }))
    .filter((entry) => Boolean(entry.label));

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (sources.length === 0) return null;

  return (
    <div
      className={`sources-drawer${variant === "editorial" ? " sources-drawer--editorial" : ""}`}
    >
      <button
        type="button"
        className={`sources-drawer__trigger${variant === "editorial" ? " sources-drawer__trigger--editorial" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Sources
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="sources-drawer__panel"
          role="region"
          aria-label="Chapter sources"
        >
          <ul className="sources-drawer__list m-0 list-none p-0">
            {sources.map((source) => (
              <li key={source.key} className="sources-drawer__item">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sources-drawer__link"
                >
                  {source.label}
                </a>
                <p className="sources-drawer__note">{source.note}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
