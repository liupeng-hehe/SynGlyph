import type { PassageTextBox } from "@/lib/colorStudio/types";

export const PASSAGE_BOX_MIN_W = 0.12;
export const PASSAGE_BOX_MIN_H = 0.1;
export const PASSAGE_FONT_SIZE_MIN = 10;
export const PASSAGE_FONT_SIZE_MAX = 48;
export const PASSAGE_FONT_SIZE_DEFAULT = 18;

export function clampPassageFontSize(n: number): number {
  if (!Number.isFinite(n)) return PASSAGE_FONT_SIZE_DEFAULT;
  return Math.max(
    PASSAGE_FONT_SIZE_MIN,
    Math.min(PASSAGE_FONT_SIZE_MAX, Math.round(n)),
  );
}

export function resolvePassageFontSize(box: PassageTextBox): number {
  if (typeof box.fontSize === "number") {
    return clampPassageFontSize(box.fontSize);
  }
  const legacyScale = (box as { fontScale?: number }).fontScale;
  if (typeof legacyScale === "number") {
    return clampPassageFontSize(Math.round(13 * legacyScale));
  }
  return PASSAGE_FONT_SIZE_DEFAULT;
}

export function createPassageTextBox(
  overrides?: Partial<PassageTextBox>,
): PassageTextBox {
  return {
    id: crypto.randomUUID(),
    text: "",
    x: 0.12,
    y: 0.28,
    width: 0.76,
    height: 0.44,
    fontSize: PASSAGE_FONT_SIZE_DEFAULT,
    textAlign: "center",
    ...overrides,
  };
}

export function combinedPassageText(boxes: PassageTextBox[]): string {
  return boxes
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function hasPassageContent(boxes: PassageTextBox[]): boolean {
  return boxes.some((b) => b.text.trim().length > 0);
}

export function clampPassageBox(box: PassageTextBox): PassageTextBox {
  const width = Math.max(PASSAGE_BOX_MIN_W, Math.min(1, box.width));
  const height = Math.max(PASSAGE_BOX_MIN_H, Math.min(1, box.height));
  const x = Math.max(0, Math.min(1 - width, box.x));
  const y = Math.max(0, Math.min(1 - height, box.y));
  const fontSize = resolvePassageFontSize(box);
  return { ...box, x, y, width, height, fontSize };
}

export function nextPassageBoxPlacement(count: number): Pick<
  PassageTextBox,
  "x" | "y" | "width" | "height"
> {
  const offset = (count % 4) * 0.04;
  return {
    x: 0.12 + offset,
    y: 0.18 + offset,
    width: 0.76 - offset * 0.5,
    height: 0.32,
  };
}
