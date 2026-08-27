/**
 * Piece metrics, coarse label suggestion, spatial relations.
 */

import type { Point } from "./preprocess";
import { verticalInGlyphFromGrid } from "./glyphGridBands";
import { suggestPiece } from "./pieceSuggester";
import { snapNearlyVerticalToColumn } from "./glyphSegmentation";
import type {
  CoarsePrimitiveLabel,
  GlyphRelationV2,
  PieceAnnotationV2,
  SideInGlyph,
  VerticalInGlyph,
} from "./glyphSchema";

/** 全部切割为竖条 → 只按左右分带；全部为横向带状 → 只按上下分带；否则用语义/质心启发。 */
export type CutLayoutMode = "vertical" | "horizontal" | "mixed";

export function inferCutLayoutMode(
  cuts: { ax: number; ay: number; bx: number; by: number }[],
  w: number,
  h: number
): CutLayoutMode {
  if (cuts.length === 0) return "mixed";
  let nV = 0,
    nH = 0,
    nO = 0;
  for (const c of cuts) {
    const s = snapNearlyVerticalToColumn(c.ax, c.ay, c.bx, c.by, w, h);
    const columnSpan = Math.abs(s.ax - s.bx);
    if (columnSpan <= 0.5) {
      nV++;
      continue;
    }
    const dx = s.bx - s.ax,
      dy = s.by - s.ay;
    const len = Math.hypot(dx, dy) || 1;
    if (Math.abs(dy) / len <= 0.48) nH++;
    else nO++;
  }
  if (nO > 0) return "mixed";
  if (nV > 0 && nH === 0) return "vertical";
  if (nH > 0 && nV === 0) return "horizontal";
  return "mixed";
}

function applyAxisBandLabels(pieces: PieceAnnotationV2[], mode: CutLayoutMode): PieceAnnotationV2[] {
  if (pieces.length === 0 || mode === "mixed") return pieces;
  if (mode === "vertical") {
    const byX = pieces
      .map((p, i) => ({ i, x: p.original_centroid[0] }))
      .sort((a, b) => a.x - b.x);
    const rankOf = new Map<number, number>();
    byX.forEach((o, rank) => rankOf.set(o.i, rank));
    const n = pieces.length;
    return pieces.map((p, idx) => {
      const rank = rankOf.get(idx) ?? 0;
      let side: SideInGlyph;
      if (n <= 1) side = "center";
      else if (n === 2) side = rank === 0 ? "left" : "right";
      else if (rank === 0) side = "left";
      else if (rank === n - 1) side = "right";
      else side = "center";
      return { ...p, side_in_glyph: side };
    });
  }
  if (mode === "horizontal") {
    const byY = pieces
      .map((p, i) => ({ i, y: p.original_centroid[1] }))
      .sort((a, b) => a.y - b.y);
    const rankOf = new Map<number, number>();
    byY.forEach((o, rank) => rankOf.set(o.i, rank));
    const n = pieces.length;
    return pieces.map((p, idx) => {
      const rank = rankOf.get(idx) ?? 0;
      let vy: VerticalInGlyph;
      if (n <= 1) vy = "middle";
      else if (n === 2) vy = rank === 0 ? "top" : "bottom";
      else if (rank === 0) vy = "top";
      else if (rank === n - 1) vy = "bottom";
      else vy = "middle";
      return { ...p, vertical_in_glyph: vy };
    });
  }
  return pieces;
}

function mapPieceTypeToCoarse(t: string): CoarsePrimitiveLabel {
  if (t === "dot") return "unknown";
  if (
    t === "line" ||
    t === "arc" ||
    t === "loop" ||
    t === "hook" ||
    t === "diagonal" ||
    t === "unknown"
  ) {
    return t;
  }
  return "unknown";
}

export function buildPieceAnnotations(
  components: Point[][],
  glyphBinary: Uint8Array,
  w: number,
  h: number,
  glyphBboxNorm: [number, number, number, number],
  cutsForLayout?: { ax: number; ay: number; bx: number; by: number }[]
): PieceAnnotationV2[] {
  const mode =
    cutsForLayout && cutsForLayout.length > 0
      ? inferCutLayoutMode(cutsForLayout, w, h)
      : "mixed";
  const base: PieceAnnotationV2[] = components.map((pixels, i) => {
    const sp = suggestPiece({
      pixels,
      skeletonPixels: pixels,
      glyphBinary,
      componentId: i,
      pieceId: `p${i}`,
      w,
      h,
      glyphBboxNorm,
    });
    const coarse = mapPieceTypeToCoarse(sp.type);
    const oc = sp.centroid;
    const offX = 0,
      offY = 0;
    return {
      piece_id: `p${i}`,
      component_id: i,
      original_centroid: [oc[0], oc[1]],
      exploded_centroid: [oc[0] + offX, oc[1] + offY],
      offset_dx: offX,
      offset_dy: offY,
      bbox_piece: sp.bbox_piece,
      label_suggested: coarse,
      label_final: coarse,
      orientation: sp.orientation_class,
      opening_dir: sp.opening_dir_applicable === false ? "none" : sp.opening_dir,
      side_in_glyph: sp.side_in_glyph,
      vertical_in_glyph: verticalInGlyphFromGrid(oc[1], h),
      confidence: sp.confidence,
      closed: sp.closed,
    };
  });
  return applyAxisBandLabels(base, mode);
}

/** Merge user-edited fields when component count/order stable (by centroid x). */
/** After loading JSON: re-apply saved labels/offsets onto freshly computed geometry. */
export function mergeLoadedAnnotations(
  loaded: PieceAnnotationV2[],
  fresh: PieceAnnotationV2[]
): PieceAnnotationV2[] {
  if (loaded.length !== fresh.length) return fresh;
  const map = new Map(loaded.map((p) => [p.piece_id, p]));
  return fresh.map((f) => {
    const o = map.get(f.piece_id);
    if (!o) return f;
    const odx = o.offset_dx,
      ody = o.offset_dy;
    return {
      ...f,
      label_final: o.label_final,
      notes: o.notes,
      label_suggested: f.label_suggested,
      side_in_glyph: o.side_in_glyph ?? f.side_in_glyph,
      vertical_in_glyph: o.vertical_in_glyph ?? f.vertical_in_glyph,
      orientation: o.orientation ?? f.orientation,
      offset_dx: odx,
      offset_dy: ody,
      exploded_centroid: [f.original_centroid[0] + odx, f.original_centroid[1] + ody],
    };
  });
}

export function mergePieceAnnotations(
  prev: PieceAnnotationV2[] | null,
  next: PieceAnnotationV2[]
): PieceAnnotationV2[] {
  if (!prev || prev.length !== next.length) return next;
  const key = (p: PieceAnnotationV2) => p.original_centroid[0];
  const a = [...prev].sort((x, y) => key(x) - key(y));
  const b = [...next].sort((x, y) => key(x) - key(y));
  return b.map((np, i) => {
    const op = a[i];
    if (!op) return np;
    const odx = op.offset_dx,
      ody = op.offset_dy;
    return {
      ...np,
      label_final: op.label_final,
      notes: op.notes,
      side_in_glyph: op.side_in_glyph,
      vertical_in_glyph: op.vertical_in_glyph ?? np.vertical_in_glyph,
      orientation: op.orientation,
      offset_dx: odx,
      offset_dy: ody,
      exploded_centroid: [np.original_centroid[0] + odx, np.original_centroid[1] + ody],
    };
  });
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function inferSpatialRelations(pieces: PieceAnnotationV2[]): GlyphRelationV2[] {
  const rels: GlyphRelationV2[] = [];
  let rid = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!,
        b = pieces[j]!;
      const ca = a.original_centroid,
        cb = b.original_centroid;
      if (dist(ca, cb) < 0.14) {
        rels.push({
          relation_id: `r${rid++}`,
          type: "attached_to",
          from_id: a.piece_id,
          to_id: b.piece_id,
        });
      }
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;
      const a = pieces[i]!,
        b = pieces[j]!;
      const ca = a.original_centroid,
        cb = b.original_centroid;
      if (ca[0] < cb[0] - 0.02) {
        rels.push({
          relation_id: `r${rid++}`,
          type: "left_of",
          from_id: a.piece_id,
          to_id: b.piece_id,
        });
      }
      if (ca[1] < cb[1] - 0.02) {
        rels.push({
          relation_id: `r${rid++}`,
          type: "above",
          from_id: a.piece_id,
          to_id: b.piece_id,
        });
      }
    }
  }
  return rels;
}
