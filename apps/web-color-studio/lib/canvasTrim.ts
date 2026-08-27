/** sRGB hex like #FFFFFF or #fff */
export function cssHexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  if (
    Number.isNaN(n) ||
    full.length !== 6
  )
    return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Keep a thin band below content so gradients/shadow tails don’t shave the last px */
const BOTTOM_MARGIN_DEVICE_PX = 6;

/**
 * Drops fully “background-like” rows from the bottom so exports aren’t preceded by huge
 * white bands when capture height was over-estimated (#ffffff fills).
 */
export function trimCanvasSolidBackgroundBottom(
  source: HTMLCanvasElement,
  backgroundCssHex = "#ffffff",
  channelTol = 18,
): HTMLCanvasElement {
  const bg = cssHexToRgb(backgroundCssHex);
  const { width: w, height: h } = source;
  if (h <= BOTTOM_MARGIN_DEVICE_PX || w < 1) return source;

  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const rowLooksEmpty = (y: number) => {
    let o = y * w * 4;
    for (let x = 0; x < w; x++) {
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      const dv = Math.max(
        Math.abs(r - bg[0]),
        Math.abs(g - bg[1]),
        Math.abs(b - bg[2]),
      );
      if (dv > channelTol) return false;
      o += 4;
    }
    return true;
  };

  let lastInkY = -1;
  for (let y = h - 1; y >= 0; y--) {
    if (!rowLooksEmpty(y)) {
      lastInkY = y;
      break;
    }
  }

  /** Entire canvas “empty” vs bg — leave as-is */
  if (lastInkY < 0) return source;

  const newH = Math.min(h, lastInkY + 1 + BOTTOM_MARGIN_DEVICE_PX);
  if (newH >= h) return source;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = newH;
  const octx = out.getContext("2d");
  if (!octx) return source;
  octx.drawImage(source, 0, 0, w, newH, 0, 0, w, newH);
  return out;
}
