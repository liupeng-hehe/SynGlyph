"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PassageReadingView } from "@/components/colorStudio/PassageReadingView";
import {
  glyphsFromLabTokens,
  glyphsFromPassageAndLetters,
  type LabRenderToken,
} from "@/lib/colorStudio/passageRender";
import { cssFontFamily, passageFontWeight } from "@/lib/colorStudio/passageFonts";
import { PassageFontSizeControl } from "@/components/colorStudio/PassageFontSizeControl";
import {
  PASSAGE_BOX_MIN_H,
  PASSAGE_BOX_MIN_W,
  resolvePassageFontSize,
} from "@/lib/colorStudio/passageBoxes";
import type { LetterColor, PassageTextBox, PdfDocumentSettings, PassageLetterVisualMode } from "@/lib/colorStudio/types";

type Props = {
  box: PassageTextBox;
  selected: boolean;
  letters: LetterColor[];
  labTokens?: LabRenderToken[] | null;
  textColor: string;
  backgroundHex: string;
  fontFamily: PdfDocumentSettings["fontFamily"];
  letterVisual: PassageLetterVisualMode;
  onSelect: () => void;
  onUpdate: (patch: Partial<PassageTextBox>) => void;
};

type DragMode = "move" | "resize-se" | null;

export function PassageBoxFrame({
  box,
  selected,
  letters,
  labTokens,
  textColor,
  backgroundHex,
  fontFamily,
  letterVisual,
  onSelect,
  onUpdate,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DragMode>(null);
  const dragStart = useRef({ px: 0, py: 0, box: box });

  const glyphs =
    labTokens?.length && box.text.trim()
      ? glyphsFromLabTokens(labTokens)
      : glyphsFromPassageAndLetters(box.text, letters, textColor);

  const applyPointerDelta = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current?.parentElement;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (clientX - dragStart.current.px) / rect.width;
      const dy = (clientY - dragStart.current.py) / rect.height;
      const start = dragStart.current.box;

      if (mode === "move") {
        onUpdate({
          x: Math.max(0, Math.min(1 - start.width, start.x + dx)),
          y: Math.max(0, Math.min(1 - start.height, start.y + dy)),
        });
        return;
      }

      if (mode === "resize-se") {
        onUpdate({
          width: Math.max(PASSAGE_BOX_MIN_W, Math.min(1 - start.x, start.width + dx)),
          height: Math.max(PASSAGE_BOX_MIN_H, Math.min(1 - start.y, start.height + dy)),
        });
      }
    },
    [mode, onUpdate],
  );

  useEffect(() => {
    if (!mode) return;
    function onMove(e: PointerEvent) {
      applyPointerDelta(e.clientX, e.clientY);
    }
    function onUp() {
      setMode(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [mode, applyPointerDelta]);

  function beginDrag(nextMode: DragMode, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    dragStart.current = { px: e.clientX, py: e.clientY, box };
    setMode(nextMode);
  }

  return (
    <div
      ref={frameRef}
      className={`absolute touch-none ${selected ? "z-20" : "z-10"}`}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        ref={canvasRef}
        className={`relative flex h-full flex-col overflow-hidden rounded-lg ${
          selected ? "ring-2 ring-byo-ink/70 ring-offset-2 ring-offset-transparent" : ""
        }`}
      >
        <div
          data-box-chrome
          className={`flex shrink-0 items-center justify-between px-2 py-1 ${
            selected ? "cursor-grab bg-byo-ink/8 active:cursor-grabbing" : "bg-byo-ink/5"
          }`}
          onPointerDown={(e) => beginDrag("move", e)}
        >
          <span
            data-box-chrome
            className="text-[9px] font-semibold uppercase tracking-[0.2em] text-byo-ink/45"
          >
            Text
          </span>
          {selected ? (
            <PassageFontSizeControl
              compact
              fontSize={resolvePassageFontSize(box)}
              onChange={(fontSize) => onUpdate({ fontSize })}
            />
          ) : null}
        </div>

        <div
          className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-1"
          onPointerDown={() => onSelect()}
        >
          {box.text.trim() ? (
            <div
              className="font-display leading-[1.55] tracking-[0.02em]"
              style={{
                fontSize: `${resolvePassageFontSize(box)}px`,
                fontFamily: cssFontFamily(fontFamily),
                fontWeight: passageFontWeight(fontFamily),
                textAlign: box.textAlign,
              }}
            >
              <PassageReadingView
                glyphs={glyphs}
                backgroundHex={backgroundHex}
                visualMode={letterVisual}
              />
            </div>
          ) : (
            <p className="text-center font-body text-xs italic text-byo-ink/35">
              Empty box
            </p>
          )}
        </div>

        {selected ? (
          <div
            data-box-chrome
            role="presentation"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl bg-byo-ink/75"
            onPointerDown={(e) => beginDrag("resize-se", e)}
          />
        ) : null}
      </div>
    </div>
  );
}
