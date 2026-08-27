/**
 * Structured glyph representation (pieces, nodes, cuts, relations).
 * Mirrors Python export for future training hooks.
 */

export type NodeType = "endpoint" | "junction" | "curvature_peak" | "anchor";
export type CutMode = "barrier" | "split_point";
export type PieceType =
  | "unknown"
  | "line"
  | "dot"
  | "arc"
  | "loop"
  | "hook"
  | "diagonal";
export type SideInGlyph = "left" | "right" | "center" | "mixed";
/** Vertical band of the piece centroid within the canvas (letterbox). */
export type VerticalInGlyph = "top" | "middle" | "bottom" | "mixed";
export type OrientationClass = "vertical" | "horizontal" | "diagonal" | "curved";
export type OpeningDir = "left" | "right" | "up" | "down" | "none";

/** Stroke axis for lines; `na` for curves / dots (export can map to empty). */
export type LineStrokeKind = "vertical" | "horizontal" | "diagonal" | "na";
/** Tittle / i-dot style mark vs ordinary stroke. */
export type MarkKind = "none" | "dot";

export type RelationType =
  | "attached_to"
  | "touches_at"
  | "left_of"
  | "right_of"
  | "above"
  | "below"
  | "inside"
  | "surrounds"
  | "shares_node_with";

/** V1 coarse labels for line-cut + exploded editor (no separate dot class). */
export type CoarsePrimitiveLabel = "line" | "arc" | "loop" | "hook" | "diagonal" | "unknown";

/** User-drawn straight cut (normalized coordinates in [0,1] relative to image). */
export interface LineCutV2 {
  cut_id: string;
  type: "line";
  points: [[number, number], [number, number]];
  /** Half-width of the cut band in **pixel** space (same as thickness/2). */
  thickness: number;
  created_by_user: true;
  /**
   * 可选：仅在此归一化轴对齐矩形内挖断（对角两点，任意顺序）。
   * 用于 t/f 等：竖切只作用在竖笔区域、横切只作用在横笔区域，避免十字交叉处整笔被切断。
   */
  clip_norm?: [[number, number], [number, number]];
}

export interface PieceAnnotationV2 {
  piece_id: string;
  component_id: number;
  original_centroid: [number, number];
  exploded_centroid: [number, number];
  /** Normalized offset (same space as centroid): added to original for display. */
  offset_dx: number;
  offset_dy: number;
  bbox_piece: [number, number, number, number];
  label_suggested: CoarsePrimitiveLabel;
  label_final: CoarsePrimitiveLabel;
  orientation: OrientationClass;
  opening_dir: OpeningDir;
  side_in_glyph: SideInGlyph;
  /** 纯横切分块时：按 centroid 上下排序得到的带（top/middle/bottom）。 */
  vertical_in_glyph?: VerticalInGlyph;
  notes?: string;
  confidence?: number;
  closed?: boolean;
}

export interface GlyphRelationV2 {
  relation_id: string;
  type: "left_of" | "right_of" | "above" | "below" | "attached_to";
  from_id: string;
  to_id: string;
}

export interface GlyphGridSettings {
  show: boolean;
}

/** Line-cut + exploded-view annotation (version 2). */
export interface GlyphAnnotationDocumentV2 {
  version: 2;
  glyph: string;
  bbox: [number, number, number, number];
  grid: GlyphGridSettings;
  image_width: number;
  image_height: number;
  cuts: LineCutV2[];
  pieces: PieceAnnotationV2[];
  relations: GlyphRelationV2[];
}

export interface GlyphNode {
  node_id: string;
  type: NodeType;
  x_norm: number;
  y_norm: number;
}

export interface GlyphCut {
  cut_id: string;
  x_norm: number;
  y_norm: number;
  mode: CutMode;
  target_hint?: {
    kind: "node" | "edge";
    node_id?: string;
    edge_from?: string;
    edge_to?: string;
    pixel_x?: number;
    pixel_y?: number;
  };
}

export interface GlyphPiece {
  piece_id: string;
  source_component_id: number;
  type: PieceType;
  subtype?: string;
  suggested_type?: PieceType;
  suggested_subtype?: string;
  side_in_glyph: SideInGlyph;
  /** Normalized vertical band; omit in older saved JSON. */
  vertical_in_glyph?: VerticalInGlyph;
  endpoints: { node_ids: string[]; coords_norm?: [number, number][] };
  apex?: [number, number];
  centroid: [number, number];
  orientation_class: OrientationClass;
  opening_dir: OpeningDir;
  /** false for line/dot/closed loop: opening_dir is UI placeholder only. */
  opening_dir_applicable?: boolean;
  /** Simple axis label for strokes (lines); na otherwise. */
  line_stroke?: LineStrokeKind;
  mark_kind?: MarkKind;
  /** Rule-based Chinese blurb for annotator review. */
  auto_description?: string;
  closed: boolean;
  bbox_piece: [number, number, number, number]; // x0,y0,x1,y1 norm
  confidence: number;
  notes?: string;
}

export interface GlyphRelation {
  relation_id: string;
  type: RelationType;
  from_id: string;
  to_id: string;
  from_kind: "piece" | "node";
  to_kind: "piece" | "node";
  metadata?: Record<string, unknown>;
}

export interface PreprocessMeta {
  image_width: number;
  image_height: number;
  binarization: string;
  skeleton_method: string;
  contour_count: number;
  /** How foreground pixels were assigned to pieces (e.g. geodesic to skeleton components). */
  piece_region_method?: string;
}

export interface GlyphDocument {
  version: 1;
  glyph: string;
  bbox: [number, number, number, number];
  nodes: GlyphNode[];
  cuts: GlyphCut[];
  pieces: GlyphPiece[];
  relations: GlyphRelation[];
  preprocess?: PreprocessMeta;
  image_metadata?: Record<string, unknown>;
}

export function emptyGlyphDocument(glyph: string): GlyphDocument {
  return {
    version: 1,
    glyph,
    bbox: [0, 0, 1, 1],
    nodes: [],
    cuts: [],
    pieces: [],
    relations: [],
  };
}

export function emptyGlyphAnnotationV2(
  glyph: string,
  imageWidth: number,
  imageHeight: number,
  bbox: [number, number, number, number] = [0, 0, 1, 1]
): GlyphAnnotationDocumentV2 {
  return {
    version: 2,
    glyph,
    bbox,
    grid: { show: true },
    image_width: imageWidth,
    image_height: imageHeight,
    cuts: [],
    pieces: [],
    relations: [],
  };
}
