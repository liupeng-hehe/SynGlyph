"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  sourceNotes,
  type SourceKey,
} from "@/content/synesthesia3DFlows";

export type BrainSourceSupProps = {
  sourceKeys: SourceKey[];
  className?: string;
};

const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join("");
}

export function BrainSourceSup({
  sourceKeys,
  className = "",
}: BrainSourceSupProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sources = sourceKeys.map((key, i) => ({
    number: i + 1,
    note: sourceNotes[key],
  }));

  const superscriptLabel = sources.map((s) => toSuperscript(s.number)).join("");

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  if (sources.length === 0) return null;

  return (
    <span
      ref={containerRef}
      className={`brain-source-sup ${className}`.trim()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="brain-source-sup__button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${sources.length} research sources. ${superscriptLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <sup>{superscriptLabel}</sup>
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Research sources"
          className="brain-source-sup__popover"
        >
          <ol className="brain-source-sup__list">
            {sources.map(({ number, note }) => (
              <li key={note.key} className="brain-source-sup__item">
                <span className="brain-source-sup__index">{number}.</span>
                <div>
                  <p className="brain-source-sup__citation">
                    {note.fullCitation}
                  </p>
                  <p className="brain-source-sup__used-for">{note.usedFor}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </span>
  );
}
