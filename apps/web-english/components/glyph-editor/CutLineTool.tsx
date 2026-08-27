"use client";

/** Default full thickness of the cut band in pixels (half-width = this/2 in segmentation). */
export const DEFAULT_CUT_THICKNESS_PX = 6;

export function normPointToPixel(p: [number, number], w: number, h: number) {
  return { x: p[0] * Math.max(1, w - 1), y: p[1] * Math.max(1, h - 1) };
}

export function pixelToNormPoint(x: number, y: number, w: number, h: number): [number, number] {
  return [x / Math.max(1, w - 1), y / Math.max(1, h - 1)];
}
