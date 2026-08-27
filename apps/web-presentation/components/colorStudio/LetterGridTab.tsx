"use client";

import { useRef, useState } from "react";

import { ColorEditModal } from "@/components/colorStudio/ColorEditModal";
import {
  LetterGridSkeleton,
  StudioLoadingBar,
} from "@/components/colorStudio/LetterGridLoading";
import { LetterColorCard } from "@/components/colorStudio/LetterColorCard";
import { PaletteToolbar } from "@/components/colorStudio/PaletteToolbar";
import { ProfilesPaletteSection } from "@/components/colorStudio/ProfilesPaletteSection";
import { applyHexToLetterColor } from "@/lib/colorStudio/colorUtils";
import { useStudio } from "@/lib/colorStudio/studioContext";
import type { LetterColor } from "@/lib/colorStudio/types";

export function LetterGridTab() {
  const { state, dispatch } = useStudio();
  const gridRef = useRef<HTMLDivElement>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const loading = !state.hydrated;

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
      {loading ? <StudioLoadingBar /> : null}
      <PaletteToolbar
        letters={state.letters}
        gridRef={gridRef}
        loading={loading}
        onGenerateExample={() => dispatch({ type: "GENERATE_EXAMPLE" })}
      />
      {loading ? (
        <LetterGridSkeleton />
      ) : (
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
      )}
      {!loading ? <ProfilesPaletteSection /> : null}
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
