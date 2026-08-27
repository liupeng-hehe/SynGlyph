/** Shared layout + color helpers for text-reveal canvas (English). */

/** Sans stack reads closer to annotation / “magazine” previews than serif body text. */
export const FONT_FAMILY =
  'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
/** Muted base glyph color on dark canvas (under spotlight). */
export const BASE_GREY = "#8c8680";
export const SHARP_BLUR_PX = 0.55;
export const POINTER_SMOOTH = 0.16;

export type RGB = { r: number; g: number; b: number };

export function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}

export function buildCharMap(text: string): number[] {
  const out: number[] = [];
  let li = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      out.push(li);
      li++;
    } else {
      out.push(-1);
    }
  }
  return out;
}

export function letterColorsSynthetic(n: number): RGB[] {
  return Array.from({ length: n }, (_, i) => hslToRgb((i * 47) % 360, 0.72, 0.58));
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").padStart(6, "0");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const x = (n: number) => n.toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Push RGB away from grey for stronger per-letter hue (display only). */
export function punchRgbForDisplay(rgb: RGB, factor = 1.18): RGB {
  const avg = (rgb.r + rgb.g + rgb.b) / 3;
  return {
    r: clamp255(avg + (rgb.r - avg) * factor),
    g: clamp255(avg + (rgb.g - avg) * factor),
    b: clamp255(avg + (rgb.b - avg) * factor),
  };
}

export type G = {
  indexInText: number;
  char: string;
  x: number;
  y: number;
};

export function layoutLineWrap(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  lineHeight: number,
  measure: (ch: string) => number
): G[] {
  const glyphs: G[] = [];
  let x = 0;
  let y = fontSizePx * 0.78;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]!;
    if (ch === "\n") {
      x = 0;
      y += lineHeight;
      continue;
    }
    const w = measure(ch);
    if (x + w > maxWidth && x > 0) {
      x = 0;
      y += lineHeight;
    }
    glyphs.push({ indexInText: k, char: ch, x, y });
    x += w;
  }
  return glyphs;
}

export function ensureCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

/** Light Lab smoothing along letter runs. */
export function smoothLetterLabs(labs: [number, number, number][], text: string): [number, number, number][] {
  if (labs.length !== text.length) return labs;
  const out: [number, number, number][] = labs.map((l) => [l[0], l[1], l[2]]);
  for (let i = 0; i < out.length; i++) {
    if (!/\p{L}/u.test(text[i]!)) continue;
    let wL = 0;
    let wa = 0;
    let wb = 0;
    let wt = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j < 0 || j >= labs.length) continue;
      if (!/\p{L}/u.test(text[j]!)) continue;
      const w = k === 0 ? 2 : 1;
      wL += labs[j]![0] * w;
      wa += labs[j]![1] * w;
      wb += labs[j]![2] * w;
      wt += w;
    }
    if (wt > 0) {
      out[i]![0] = wL / wt;
      out[i]![1] = wa / wt;
      out[i]![2] = wb / wt;
    }
  }
  return out;
}

/** Word = whitespace-bounded run; inclusive end index. */
export function wordCharRangeAt(text: string, indexInText: number): [number, number] | null {
  if (indexInText < 0 || indexInText >= text.length) return null;
  let l = indexInText;
  let r = indexInText;
  while (l > 0 && !/\s/u.test(text[l - 1]!)) l--;
  while (r < text.length - 1 && !/\s/u.test(text[r + 1]!)) r++;
  return [l, r];
}

export function hitTestGlyphIndex(
  glyphs: G[],
  cx: number,
  cy: number,
  _font: string,
  fontSizePx: number,
  measure: (ch: string) => number
): number {
  for (const g of glyphs) {
    const gw = measure(g.char);
    if (cx >= g.x && cx <= g.x + gw && cy >= g.y - fontSizePx * 1.15 && cy <= g.y + fontSizePx * 0.35) {
      return g.indexInText;
    }
  }
  return -1;
}

export function spanPixelBounds(
  glyphs: G[],
  start: number,
  end: number,
  measure: (ch: string) => number,
  fontSizePx: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const g of glyphs) {
    if (g.indexInText < start || g.indexInText > end) continue;
    any = true;
    const gw = measure(g.char);
    minX = Math.min(minX, g.x);
    maxX = Math.max(maxX, g.x + gw);
    minY = Math.min(minY, g.y - fontSizePx * 1.15);
    maxY = Math.max(maxY, g.y + fontSizePx * 0.35);
  }
  return any ? { minX, minY, maxX, maxY } : null;
}
