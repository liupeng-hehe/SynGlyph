"use client";

import { PassageFontSizeControl } from "@/components/colorStudio/PassageFontSizeControl";
import { resolvePassageFontSize } from "@/lib/colorStudio/passageBoxes";
import type { PassageTextBox } from "@/lib/colorStudio/types";

type Props = {
  boxes: PassageTextBox[];
  activeBoxId: string | null;
  onSelectBox: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onUpdateBox: (id: string, patch: Partial<PassageTextBox>) => void;
  onAddBox: () => void;
  onDeleteBox: (id: string) => void;
};

export function PassageTextBoxPanel({
  boxes,
  activeBoxId,
  onSelectBox,
  onChangeText,
  onUpdateBox,
  onAddBox,
  onDeleteBox,
}: Props) {
  const active =
    boxes.find((b) => b.id === activeBoxId) ?? boxes[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-byo-ink">Text boxes</label>
        <button
          type="button"
          onClick={onAddBox}
          className="rounded-full bg-byo-ink/10 px-3 py-1.5 text-xs font-medium text-byo-ink hover:bg-byo-ink/15"
        >
          + Add text box
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {boxes.map((box, index) => {
          const selected = box.id === active?.id;
          return (
            <button
              key={box.id}
              type="button"
              onClick={() => onSelectBox(box.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "bg-byo-ink text-white"
                  : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
              }`}
            >
              Box {index + 1}
            </button>
          );
        })}
      </div>

      {active ? (
        <>
          <textarea
            value={active.text}
            onChange={(e) => onChangeText(active.id, e.target.value)}
            rows={6}
            placeholder="Type text for this box…"
            className="w-full resize-y rounded-xl border border-byo-ink/20 bg-white px-4 py-3 font-body text-sm text-byo-ink outline-none placeholder:text-byo-ink/40 focus:border-byo-ink/50"
          />

          <PassageFontSizeControl
            fontSize={resolvePassageFontSize(active)}
            onChange={(fontSize) => onUpdateBox(active.id, { fontSize })}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-byo-ink/70">Align</span>
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => onUpdateBox(active.id, { textAlign: align })}
                className={`rounded-lg px-2.5 py-1 text-xs capitalize ${
                  active.textAlign === align
                    ? "bg-byo-ink text-white"
                    : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
                }`}
              >
                {align}
              </button>
            ))}
          </div>

          {boxes.length > 1 ? (
            <button
              type="button"
              onClick={() => onDeleteBox(active.id)}
              className="text-xs text-red-700/80 hover:text-red-800"
            >
              Delete this text box
            </button>
          ) : null}

          <p className="text-[11px] leading-relaxed text-byo-ink/50">
            Drag and resize boxes in the live preview on the right.
          </p>
        </>
      ) : null}
    </div>
  );
}
