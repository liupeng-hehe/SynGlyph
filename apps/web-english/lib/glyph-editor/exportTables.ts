/**
 * ML-friendly tabular export alongside full glyph JSON.
 */

import type { GlyphDocument, GlyphNode, GlyphPiece, GlyphRelation } from "./glyphSchema";

export interface NodeRow {
  glyph: string;
  node_id: string;
  type: string;
  x_norm: number;
  y_norm: number;
}

export interface PieceRow {
  glyph: string;
  piece_id: string;
  source_component_id: number;
  type: string;
  suggested_type?: string;
  subtype?: string;
  side_in_glyph: string;
  vertical_in_glyph?: string;
  orientation_class: string;
  opening_dir: string;
  opening_dir_applicable?: boolean;
  line_stroke?: string;
  mark_kind?: string;
  auto_description?: string;
  closed: boolean;
  centroid_x: number;
  centroid_y: number;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
  confidence: number;
}

export interface RelationRow {
  glyph: string;
  relation_id: string;
  type: string;
  from_id: string;
  to_id: string;
  from_kind: string;
  to_kind: string;
}

export function toMlTables(doc: GlyphDocument) {
  const g = doc.glyph;
  const nodes: NodeRow[] = doc.nodes.map((n: GlyphNode) => ({
    glyph: g,
    node_id: n.node_id,
    type: n.type,
    x_norm: n.x_norm,
    y_norm: n.y_norm,
  }));
  const pieces: PieceRow[] = doc.pieces.map((p: GlyphPiece) => ({
    glyph: g,
    piece_id: p.piece_id,
    source_component_id: p.source_component_id,
    type: p.type,
    suggested_type: p.suggested_type,
    subtype: p.subtype,
    side_in_glyph: p.side_in_glyph,
    vertical_in_glyph: p.vertical_in_glyph ?? "",
    orientation_class: p.orientation_class,
    opening_dir:
      p.opening_dir_applicable === false ? "" : p.opening_dir,
    opening_dir_applicable: p.opening_dir_applicable !== false,
    line_stroke: p.line_stroke ?? "",
    mark_kind: p.mark_kind ?? "",
    auto_description: p.auto_description ?? "",
    closed: p.closed,
    centroid_x: p.centroid[0],
    centroid_y: p.centroid[1],
    bbox_x0: p.bbox_piece[0],
    bbox_y0: p.bbox_piece[1],
    bbox_x1: p.bbox_piece[2],
    bbox_y1: p.bbox_piece[3],
    confidence: p.confidence,
  }));
  const relations: RelationRow[] = doc.relations.map((r: GlyphRelation) => ({
    glyph: g,
    relation_id: r.relation_id,
    type: r.type,
    from_id: r.from_id,
    to_id: r.to_id,
    from_kind: r.from_kind,
    to_kind: r.to_kind,
  }));
  return { nodes, pieces, relations };
}

export function tablesToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
