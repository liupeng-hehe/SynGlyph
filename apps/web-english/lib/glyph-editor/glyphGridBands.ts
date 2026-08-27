/**
 * 与 GlyphCanvas 田字格对齐：中线在像素 (w/2, h/2)，对应归一化坐标与 centroid 一致。
 */

import type { VerticalInGlyph } from "./glyphSchema";

/** 水平中线（田字格横线）的归一化 y，与 ReferenceGrid 的 y = h/2 一致。 */
export function gridHorizontalMidNorm(h: number): number {
  return (h / 2) / Math.max(1, h - 1);
}

/** 竖直中线（田字格竖线）的归一化 x。 */
export function gridVerticalMidNorm(w: number): number {
  return (w / 2) / Math.max(1, w - 1);
}

/**
 * 用部件 centroid 的归一化 y 与田字格水平中线比较，得上 / 中 / 下。
 * eps 取约 1 像素（归一化）以免贴线时抖动。
 */
export function verticalInGlyphFromGrid(cyNorm: number, h: number): VerticalInGlyph {
  const yMid = gridHorizontalMidNorm(h);
  const eps = Math.max(1 / Math.max(1, h - 1), 0.004);
  if (cyNorm < yMid - eps) return "top";
  if (cyNorm > yMid + eps) return "bottom";
  return "middle";
}
