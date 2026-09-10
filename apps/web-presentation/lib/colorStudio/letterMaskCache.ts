type MaskPayload = { w: number; h: number; data: Uint8ClampedArray };

function maskHasLetterInk(data: Uint8ClampedArray): boolean {
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a > 80 && r + g + b > 380) {
      bright++;
      if (bright > 30) return true;
    }
  }
  return false;
}

const cache = new Map<string, MaskPayload>();

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Build A–Z glyph masks once so stipple paint does not stagger on first paint. */
export async function prewarmLetterMasksAsync(): Promise<void> {
  if (typeof document === "undefined") return;
  for (let i = 0; i < ALPHABET.length; i++) {
    getLetterMask(ALPHABET[i]!);
    if (i > 0 && i % 5 === 4) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
}

export type LetterMaskWeight = "default" | "heavy";

/** Reuse glyph masks across all letter cards (A–Z built once per session). */
export function getLetterMask(
  letter: string,
  weight: LetterMaskWeight = "default",
): MaskPayload | null {
  if (typeof document === "undefined") return null;
  const char =
    letter && letter.trim().length > 0 ? letter.trim().slice(0, 1).toUpperCase() : "?";
  const cacheKey = weight === "default" ? char : `${char}:${weight}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const w = 256;
  const h = 320;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fs = Math.floor(h * 0.5);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const heavy = weight === "heavy";
  const stacks: string[] = [
    `${heavy ? 900 : 700} ${fs}px ui-serif, "Times New Roman", Georgia, serif`,
    `${heavy ? 900 : "bold"} ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`,
  ];

  let data: Uint8ClampedArray | null = null;
  for (const font of stacks) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = font;
    ctx.fillText(char, w / 2, h / 2);
    if (heavy) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(8, fs * 0.055);
      ctx.strokeStyle = "#fff";
      ctx.strokeText(char, w / 2, h / 2);
    }
    const sample = ctx.getImageData(0, 0, w, h).data;
    if (maskHasLetterInk(sample)) {
      data = sample;
      break;
    }
    data = sample;
  }

  if (!data) return null;
  if (!maskHasLetterInk(data)) return null;
  const payload: MaskPayload = { w, h, data };
  cache.set(cacheKey, payload);
  return payload;
}

export function insideMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const i = (y * w + x) * 4;
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  const a = data[i + 3]!;
  return a > 30 && r + g + b > 280;
}
