import type { AnchorSpec, ColorSpec, SpreadSpec } from "@synglyph/annotation-core";

/** Normalized glyph from MakeMeAHanzi-style sources (loader output). */
export type NormalizedGlyphTemplate = {
  character: string;
  decomposition: string | null;
  matches: unknown;
  strokes: string[];
  medians: number[][][];
};

export type RegionSeedCandidate = {
  id: string;
  strokeIds: number[];
  label?: string;
};

export type ChineseRegionDraft = {
  id: string;
  name: string;
  selectionMode: "component_path" | "stroke_group" | "polygon" | "hybrid";
  strokeIds: number[];
  polygonPoints: { x: number; y: number }[];
  anchor: AnchorSpec;
  color: ColorSpec;
  spread: SpreadSpec;
  intensity: number;
  zIndex: number;
};

export function bboxFromMedians(medians: number[][][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of medians) {
    for (const pt of stroke) {
      const x = pt[0];
      const y = pt[1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 900, maxY: 900 };
  return { minX, minY, maxX, maxY };
}
