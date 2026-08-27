"use client";

import { forwardRef, useMemo } from "react";

import { PassageBoxFrame } from "@/components/colorStudio/PassageBoxFrame";
import type { LabRenderToken } from "@/lib/colorStudio/passageRender";
import { hasPassageContent } from "@/lib/colorStudio/passageBoxes";
import type { LetterColor, PassageTextBox, PdfDocumentSettings } from "@/lib/colorStudio/types";

type Props = {
  boxes: PassageTextBox[];
  activeBoxId: string | null;
  letters: LetterColor[];
  labTokensByBoxId?: Record<string, LabRenderToken[] | null>;
  renderedBackgroundHex: string;
  textColor: string;
  settings: PdfDocumentSettings;
  onSelectBox: (id: string) => void;
  onUpdateBox: (id: string, patch: Partial<PassageTextBox>) => void;
};

export const PassageLivePreview = forwardRef<HTMLDivElement, Props>(
  function PassageLivePreview(
    {
      boxes,
      activeBoxId,
      letters,
      labTokensByBoxId,
      renderedBackgroundHex,
      textColor,
      settings,
      onSelectBox,
      onUpdateBox,
    },
    ref,
  ) {
    const hasContent = useMemo(() => hasPassageContent(boxes), [boxes]);

    return (
      <div
        ref={ref}
        className="relative min-h-[min(70vh,560px)] overflow-hidden rounded-2xl shadow-[0_16px_48px_rgba(0,47,167,0.07)]"
        style={{ backgroundColor: renderedBackgroundHex }}
        onPointerDown={() => onSelectBox("")}
      >
        <div className="relative z-[1] min-h-[inherit]">
          <div className="relative min-h-[inherit] p-6 sm:p-8">
            {!hasContent ? (
              <div className="flex min-h-[min(60vh,480px)] items-center justify-center">
                <p
                  className="max-w-xs text-center font-body text-sm italic leading-relaxed"
                  style={{ color: textColor, opacity: 0.5 }}
                >
                  Add a text box and type your passage — drag and resize boxes on this canvas.
                </p>
              </div>
            ) : null}

            <div className="relative min-h-[min(60vh,480px)] w-full">
              {boxes.map((box) => (
                <PassageBoxFrame
                  key={box.id}
                  box={box}
                  selected={box.id === activeBoxId}
                  letters={letters}
                  labTokens={labTokensByBoxId?.[box.id]}
                  textColor={textColor}
                  backgroundHex={renderedBackgroundHex}
                  fontFamily={settings.fontFamily}
                  letterVisual={settings.passageLetterVisual ?? "fill"}
                  onSelect={() => onSelectBox(box.id)}
                  onUpdate={(patch) => onUpdateBox(box.id, patch)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
