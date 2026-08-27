"use client";

import { useEffect, useState } from "react";

import { normalizeHex } from "@/lib/colorStudio/colorAdapter";
import { fetchTheColorApiName } from "@/lib/colorStudio/colorNaming";
import type { LetterColor, SuggestedTextColor } from "@/lib/colorStudio/types";

type Mode =
  | { kind: "letter"; letter: LetterColor; index: number }
  | { kind: "suggestion"; suggestion: SuggestedTextColor };

type Props = {
  open: boolean;
  mode: Mode | null;
  onClose: () => void;
  onSaveLetter?: (index: number, hex: string, customName?: string) => void;
  onSaveSuggestion?: (hex: string, customName?: string) => void;
};

export function ColorEditModal({
  open,
  mode,
  onClose,
  onSaveLetter,
  onSaveSuggestion,
}: Props) {
  const [hexInput, setHexInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !mode) return;
    if (mode.kind === "letter") {
      setHexInput(mode.letter.hex);
      setNameInput(mode.letter.customColorName ?? "");
    } else {
      setHexInput(mode.suggestion.hex);
      setNameInput(mode.suggestion.customColorName ?? "");
    }
  }, [open, mode]);

  if (!open || !mode) return null;

  async function handleApiName() {
    setBusy(true);
    try {
      const n = await fetchTheColorApiName(hexInput);
      if (n) setNameInput(n);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!mode) return;
    try {
      normalizeHex(hexInput);
    } catch {
      return;
    }
    const customName = nameInput.trim() || undefined;
    if (mode.kind === "letter") {
      onSaveLetter?.(mode.index, hexInput, customName);
    } else {
      onSaveSuggestion?.(hexInput, customName);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-byo-ink/25 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-byo-ink/20 bg-byo-bg p-6 text-byo-ink shadow-2xl"
      >
        <h2 className="font-display text-xl font-semibold text-byo-ink">
          Edit color
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-byo-ink/75">
          Names default to the nearest match in the local color library (LAB space, same ΔE as on
          the card). The button below calls{" "}
          <span className="font-mono text-byo-ink/90">thecolorapi.com</span> only when you click
          it — an optional alternate name is filled into the field; nothing is fetched automatically.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="block text-sm text-byo-ink/85">
            HEX
            <input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-byo-ink/25 bg-white px-3 py-2 font-mono text-sm text-byo-ink outline-none focus:border-byo-ink/50"
              spellCheck={false}
            />
          </label>
          <label className="block text-sm text-byo-ink/85">
            Native picker
            <input
              type="color"
              value={
                (() => {
                  try {
                    return normalizeHex(hexInput);
                  } catch {
                    return "#888888";
                  }
                })()
              }
              onChange={(e) => setHexInput(e.target.value.toUpperCase())}
              className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-byo-ink/20 bg-white"
            />
          </label>
          <label className="block text-sm text-byo-ink/85">
            Display name (optional override)
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-byo-ink/25 bg-white px-3 py-2 text-sm text-byo-ink outline-none focus:border-byo-ink/50"
              placeholder={
                mode.kind === "letter"
                  ? `Default (local nearest): ${mode.letter.suggestedColorName}`
                  : `Default (local nearest): ${mode.suggestion.suggestedColorName}`
              }
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApiName}
              disabled={busy}
              className="rounded-lg bg-byo-ink/10 px-3 py-2 text-xs font-medium text-byo-ink hover:bg-byo-ink/15 disabled:opacity-40"
            >
              {busy ? "Fetching…" : "Fetch name from The Color API"}
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-byo-ink/80 hover:bg-byo-ink/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-byo-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
