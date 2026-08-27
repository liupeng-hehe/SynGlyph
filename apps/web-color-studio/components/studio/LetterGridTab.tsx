"use client";

import { useRef, useState } from "react";

import { ColorEditModal } from "@/components/studio/ColorEditModal";
import { LetterColorCard } from "@/components/studio/LetterColorCard";
import { PaletteToolbar } from "@/components/studio/PaletteToolbar";
import { ProfilesPaletteSection } from "@/components/studio/ProfilesPaletteSection";
import { applyHexToLetterColor } from "@/lib/colorUtils";
import { useStudio } from "@/lib/studioContext";
import type { LetterColor } from "@/lib/types";

export function LetterGridTab() {
  const { state, dispatch } = useStudio();
  const gridRef = useRef<HTMLDivElement>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const editingLetter =
    editIndex != null ? state.letters[editIndex] ?? null : null;

  function handleSaveLetter(index: number, hex: string, customName?: string) {
    const prev = state.letters[index];
    if (!prev) return;
    try {
      let next: LetterColor = applyHexToLetterColor(prev, hex, "local");
      const trimmed = customName?.trim();
      next = {
        ...next,
        customColorName: trimmed || undefined,
        nameSource: trimmed ? "user" : "local",
      };
      dispatch({ type: "UPDATE_LETTER", index, letter: next });
    } catch {
      /* invalid hex */
    }
  }

  return (
    <div className="space-y-6">
      <PaletteToolbar
        letters={state.letters}
        gridRef={gridRef}
        onGenerateExample={() => dispatch({ type: "GENERATE_EXAMPLE" })}
      />
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {state.letters.map((lc, index) => (
          <LetterColorCard
            key={lc.letter}
            letterColor={lc}
            onClickCard={() => setEditIndex(index)}
          />
        ))}
      </div>
      <ProfilesPaletteSection />
      <ColorEditModal
        open={editIndex !== null}
        mode={
          editingLetter && editIndex !== null
            ? { kind: "letter", letter: editingLetter, index: editIndex }
            : null
        }
        onClose={() => setEditIndex(null)}
        onSaveLetter={(index, hex, customName) => {
          handleSaveLetter(index, hex, customName);
          setEditIndex(null);
        }}
      />
    </div>
  );
}
