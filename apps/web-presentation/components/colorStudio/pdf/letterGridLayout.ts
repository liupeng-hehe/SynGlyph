/**
 * Layout helpers for raster letter-grid PDF export.
 * Mirrors padding / title spacing in LetterGridRasterDocument.
 */

/** A4 in points (@react-pdf/renderer default ISO). */
const A4_PT = { w: 595.28, h: 841.89 };

const padH = 28;
const padTop = 28;
const padBottom = 32;
/** Title is baked into raster export; reserve only page breathing room under padding. */
const titleBlockApproxPt = 0;
const titleImageGapApproxPt = 0;

/** Usable bounding box for the screenshot image (contain-fit inside page body). */
export const LETTER_GRID_SCREENSHOT_BOX_PT = {
  width: A4_PT.w - 2 * padH,
  height:
    A4_PT.h -
    padTop -
    padBottom -
    titleBlockApproxPt -
    titleImageGapApproxPt,
} as const;

/**
 * Sizes an image proportionally so it fits inside [areaW_pt × areaH_pt] without clipping.
 */
export function fitScreenshotContainPts(
  areaW_pt: number,
  areaH_pt: number,
  imageNaturalWidthPx: number,
  imageNaturalHeightPx: number,
): { widthPt: number; heightPt: number } {
  const iw = Math.max(1, imageNaturalWidthPx);
  const ih = Math.max(1, imageNaturalHeightPx);
  const imageAspect = iw / ih;
  const boxAspect = areaW_pt / areaH_pt;
  if (imageAspect > boxAspect) {
    const widthPt = areaW_pt;
    return { widthPt, heightPt: widthPt / imageAspect };
  }
  const heightPt = areaH_pt;
  return { widthPt: heightPt * imageAspect, heightPt };
}

/** Decode raster dimensions from an html-to-image / canvas data URL (browser). */
export function getPngDataUrlNaturalPx(
  dataUrl: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image unsupported"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({
        w: Math.max(1, img.naturalWidth),
        h: Math.max(1, img.naturalHeight),
      });
    };
    img.onerror = () => reject(new Error("Failed to decode PNG data URL"));
    img.src = dataUrl;
  });
}
