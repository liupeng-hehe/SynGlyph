/** BYO shell — match Studio header / referenced title strip */
export const SYN_GRID_EXPORT_BG = "#FFF8E7";
export const SYN_GRID_EXPORT_INK = "#002FA7";

export const SYN_GRID_EXPORT_TITLE = "SYNESTHETIC COLOR STUDIO" as const;

/**
 * Matches `scale` passed into html-to-image / html2canvas (e.g. 2 → device-pixel ratio).
 * Banner height scales with raster resolution.
 */
export function synGridExportTitleBannerDevicePx(scale: number): number {
  return Math.round(Math.max(2, scale) * 42);
}

/**
 * Stacks a centered tracked title strip above the letter grid raster (PNG + raster PDF source).
 */
export function compositeGridCanvasWithTitleStrip(
  gridCanvas: HTMLCanvasElement,
  scale: number,
): HTMLCanvasElement {
  const w = gridCanvas.width;
  const bh = synGridExportTitleBannerDevicePx(scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = bh + gridCanvas.height;

  const ctx = out.getContext("2d");
  if (!ctx) return gridCanvas;

  ctx.fillStyle = SYN_GRID_EXPORT_BG;
  ctx.fillRect(0, 0, w, bh);

  const fontPxDevice = Math.max(12, Math.round(10.5 * scale));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SYN_GRID_EXPORT_INK;
  ctx.font = `300 ${fontPxDevice}px "DM Sans", "DM Sans Fallback", ui-sans-serif, system-ui, sans-serif`;

  /** ~0.32em visually matches the spaced letter header reference */
  const letterSpacingPx =
    Math.round(((fontPxDevice * 0.32) + Number.EPSILON) * 100) / 100;
  ctx.letterSpacing = `${letterSpacingPx}px`;
  ctx.fillText(SYN_GRID_EXPORT_TITLE, w / 2, bh / 2 + Math.round(scale * 0.5));

  ctx.drawImage(gridCanvas, 0, bh);
  return out;
}

/** Decode raster into a canvas so fallbacks / compositing stay in one pipeline. */
export function loadCanvasFromPngDataUrl(
  dataUrl: string,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image unsupported"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = Math.max(1, img.naturalWidth);
        c.height = Math.max(1, img.naturalHeight);
        const ictx = c.getContext("2d");
        if (!ictx) {
          reject(new Error("2d context"));
          return;
        }
        ictx.drawImage(img, 0, 0);
        resolve(c);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error("PNG data URL decode failed"));
    img.crossOrigin = "anonymous";
    img.src = dataUrl;
  });
}
