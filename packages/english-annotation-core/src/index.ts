/**
 * English product–specific types only (no Chinese).
 * Re-exports shared color/transition primitives where useful.
 */
export type { ColorSpec, DirectedTransitionSpec, AnchorSpec, SpreadSpec } from "@synglyph/annotation-core";

export type EnglishSegmentDraft = {
  id: string;
  order: number;
  text: string;
  colorJson: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
};
