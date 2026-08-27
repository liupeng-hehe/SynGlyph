/**
 * Graph-first glyph structure: skeleton topology + per-segment geometric features.
 * No semantic labels (no "upper arc"); roles are implied by continuous features + topology.
 */

import type { Point, PreprocessResult } from "./preprocess";
import { runPreprocess } from "./preprocess";
import type { SkeletonGraph, SkeletonNodeType, SkGraphEdge, SkGraphNode } from "./skeletonGraph";
import {
  buildSkeletonGraph,
  pruneSkeletonSpursPreservingMinorComponents,
  simplifySkeletonGraphByProximity,
} from "./skeletonGraph";

/** Default topology simplification: ~5–10 nodes/edges on 256px raster after prune + merge. */
export const GLYPH_GRAPH_TOPOLOGY_DEFAULTS = {
  pruneSpurMaxLen: 6,
  mergeSeparationPx: 17,
} as const;

export interface AnchorFrame {
  /** Glyph foreground centroid, normalized [0,1] */
  centroidNorm: [number, number];
  /** Ink bounding box in normalized coords */
  bboxNorm: { minX: number; minY: number; maxX: number; maxY: number };
  /** Thirds along y for coarse top/middle/bottom (0 = top of image) */
  bandYTop: number;
  bandYBottom: number;
}

export interface SegmentFeatures {
  pixelPathLength: number;
  euclideanEndToEnd: number;
  tortuosity: number;
  meanTurnAngle: number;
  dominantOrientationRad: number;
  centerNormX: number;
  centerNormY: number;
  bboxWidthNorm: number;
  bboxHeightNorm: number;
  distToGlyphCentroidNorm: number;
  /** Continuous vertical position: 0 top → 1 bottom of glyph bbox */
  verticalPositionInGlyph: number;
  /** Horizontal offset: -1 left … +1 right relative to glyph center */
  horizontalOffsetFromGlyphCenter: number;
  /** Whether this segment lies on a cycle in the skeleton graph (e.g. bowl of b, o) */
  inCycle: boolean;
  /** Graph degree at endpoints (from topology nodes) */
  degreeAtFrom: number;
  degreeAtTo: number;
}

export interface GraphLevelFeatures {
  topologyNodeCount: number;
  topologyEdgeCount: number;
  binaryPixelCount: number;
  skeletonPixelCount: number;
  inkAreaRatio: number;
}

export interface PrimitiveSegment {
  segmentId: string;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  features: SegmentFeatures;
}

export interface GlyphGraphExportV1 {
  version: 1;
  char: string;
  image: { width: number; height: number };
  processing: GraphLevelFeatures;
  anchors: AnchorFrame;
  skeletonTopology: {
    nodes: { id: string; x: number; y: number; type: string; strokeColor?: string }[];
    edges: {
      id: string;
      from: string;
      to: string;
      pixelPathLength: number;
      /** Pixel path for visualization / GNN edge attributes (ordered along the skeleton) */
      pixels: { x: number; y: number }[];
      /** Manual editor: cubic Bézier handles (round-trip with topology UI) */
      cp1x?: number;
      cp1y?: number;
      cp2x?: number;
      cp2y?: number;
    }[];
  };
  primitives: PrimitiveSegment[];
  /** Optional GNN-friendly tensors as nested arrays (same order as primitives / topology) */
  gnnHint?: {
    segmentFeatureKeys: (keyof SegmentFeatures)[];
    segmentFeatureMatrix: number[][];
  };
}

/** Manual SVG editor: minimal node positions + undirected edges (stored as one directed pair). */
export interface TopologyNode {
  id: string;
  x: number;
  y: number;
  /** Editor override: junction = 橘色, endpoint = 蓝；omit = 按度数推断 */
  role?: "junction" | "endpoint";
  /** 笔画颜色（如 #e11d48）；omit = 按 endpoint/junction 默认蓝/橘 */
  strokeColor?: string;
}

/** Cubic Bézier from `from` → `to`; cp1 靠近 from，cp2 靠近 to（Photoshop 钢笔式） */
export interface TopologyEdge {
  from: string;
  to: string;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

/** 弦上 1/3、2/3 控制点，共线时为直线 */
export function defaultBezierHandles(
  ax: number,
  ay: number,
  bx: number,
  by: number
): Pick<TopologyEdge, "cp1x" | "cp1y" | "cp2x" | "cp2y"> {
  return {
    cp1x: ax + (bx - ax) / 3,
    cp1y: ay + (by - ay) / 3,
    cp2x: ax + (2 * (bx - ax)) / 3,
    cp2y: ay + (2 * (by - ay)) / 3,
  };
}

function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function dedupeConsecutivePoints(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

/** Dense pixel path along cubic Bézier (for export + features). */
export function flattenCubicBezierToPixels(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  samplesAlongCurve = 48
): Point[] {
  const dense: Point[] = [];
  for (let i = 0; i < samplesAlongCurve; i++) {
    const t0 = i / samplesAlongCurve;
    const t1 = (i + 1) / samplesAlongCurve;
    const a = cubicBezierPoint(t0, p0, p1, p2, p3);
    const b = cubicBezierPoint(t1, p0, p1, p2, p3);
    const seg = bresenhamLine(
      Math.round(a.x),
      Math.round(a.y),
      Math.round(b.x),
      Math.round(b.y)
    );
    for (const q of seg) dense.push(q);
  }
  return dedupeConsecutivePoints(dense);
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Point[] {
  const out: Point[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const x1r = Math.round(x1);
  const y1r = Math.round(y1);
  const dx = Math.abs(x1r - x);
  const dy = Math.abs(y1r - y);
  const sx = x < x1r ? 1 : -1;
  const sy = y < y1r ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    out.push({ x, y });
    if (x === x1r && y === y1r) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export function inferTopologyNodeTypes(
  nodes: TopologyNode[],
  edges: TopologyEdge[]
): { id: string; x: number; y: number; type: SkeletonNodeType }[] {
  const deg = new Map<string, number>();
  for (const n of nodes) deg.set(n.id, 0);
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  }
  return nodes.map((n) => {
    if (n.role === "junction" || n.role === "endpoint") {
      return { id: n.id, x: n.x, y: n.y, type: n.role };
    }
    const d = deg.get(n.id) || 0;
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      type: d <= 1 ? "endpoint" : "junction",
    };
  });
}

/**
 * Recompute {@link GlyphGraphExportV1} from manual topology: edge pixels = cubic Bézier sample or Bresenham if straight.
 */
export function rebuildGlyphGraphFromTopology(
  pre: PreprocessResult,
  char: string,
  topology: { nodes: TopologyNode[]; edges: TopologyEdge[] }
): GlyphGraphExportV1 {
  const w = pre.width;
  const h = pre.height;
  const { nodes, edges } = topology;
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

  const skEdges: SkGraphEdge[] = edges.map((e, i) => {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) throw new Error(`Missing node for edge ${e.from}–${e.to}`);
    const h0 = defaultBezierHandles(a.x, a.y, b.x, b.y);
    const p0: Point = { x: a.x, y: a.y };
    const p1: Point = {
      x: e.cp1x ?? h0.cp1x!,
      y: e.cp1y ?? h0.cp1y!,
    };
    const p2: Point = {
      x: e.cp2x ?? h0.cp2x!,
      y: e.cp2y ?? h0.cp2y!,
    };
    const p3: Point = { x: b.x, y: b.y };
    const pixels = flattenCubicBezierToPixels(p0, p1, p2, p3);
    return {
      id: `e${i}`,
      from: e.from,
      to: e.to,
      pixels,
    };
  });

  const typedNodes = inferTopologyNodeTypes(nodes, edges);
  const topoNodes = typedNodes.map((t) => {
    const src = nodes.find((n) => n.id === t.id);
    return {
      id: t.id,
      x: t.x,
      y: t.y,
      type: t.type,
      ...(src?.strokeColor ? { strokeColor: src.strokeColor } : {}),
    };
  });
  const topoEdges = skEdges.map((e, i) => {
    const te = edges[i]!;
    const base = {
      id: e.id,
      from: e.from,
      to: e.to,
      pixelPathLength: e.pixels.length,
      pixels: e.pixels.map((p) => ({ x: p.x, y: p.y })),
    };
    const cp: Partial<Pick<TopologyEdge, "cp1x" | "cp1y" | "cp2x" | "cp2y">> = {};
    if (te.cp1x != null) cp.cp1x = te.cp1x;
    if (te.cp1y != null) cp.cp1y = te.cp1y;
    if (te.cp2x != null) cp.cp2x = te.cp2x;
    if (te.cp2y != null) cp.cp2y = te.cp2y;
    return Object.keys(cp).length ? { ...base, ...cp } : base;
  });

  const anchor = computeAnchorFrame(pre.binary, w, h);
  const binCount = countBinaryPixels(pre.binary);
  const skCount = countSkeletonPixels(pre.skeleton);
  const inkRatio = binCount / (w * h);
  const degrees = nodeDegrees(skEdges);

  const primitives: PrimitiveSegment[] = skEdges.map((e, i) => {
    const features = computeSegmentFeaturesForEdge(e, skEdges, w, h, anchor, degrees);
    return {
      segmentId: `seg_${i}`,
      edgeId: e.id,
      fromNodeId: e.from,
      toNodeId: e.to,
      features,
    };
  });

  const keys: (keyof SegmentFeatures)[] = [
    "pixelPathLength",
    "euclideanEndToEnd",
    "tortuosity",
    "meanTurnAngle",
    "dominantOrientationRad",
    "centerNormX",
    "centerNormY",
    "bboxWidthNorm",
    "bboxHeightNorm",
    "distToGlyphCentroidNorm",
    "verticalPositionInGlyph",
    "horizontalOffsetFromGlyphCenter",
    "inCycle",
    "degreeAtFrom",
    "degreeAtTo",
  ];
  const segmentFeatureMatrix = primitives.map((p) => keys.map((k) => Number(p.features[k])));

  return {
    version: 1,
    char,
    image: { width: w, height: h },
    processing: {
      topologyNodeCount: topoNodes.length,
      topologyEdgeCount: topoEdges.length,
      binaryPixelCount: binCount,
      skeletonPixelCount: skCount,
      inkAreaRatio: inkRatio,
    },
    anchors: anchor,
    skeletonTopology: { nodes: topoNodes, edges: topoEdges },
    primitives,
    gnnHint: {
      segmentFeatureKeys: keys,
      segmentFeatureMatrix,
    },
  };
}

function countBinaryPixels(binary: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < binary.length; i++) s += binary[i] ? 1 : 0;
  return s;
}

function countSkeletonPixels(sk: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < sk.length; i++) s += sk[i] ? 1 : 0;
  return s;
}

export function computeAnchorFrame(binary: Uint8Array, w: number, h: number): AnchorFrame {
  let sumX = 0,
    sumY = 0,
    cnt = 0;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!binary[y * w + x]) continue;
      sumX += x;
      sumY += y;
      cnt++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const dw = Math.max(w - 1, 1);
  const dh = Math.max(h - 1, 1);
  const cx = cnt ? sumX / cnt : w / 2;
  const cy = cnt ? sumY / cnt : h / 2;
  const bboxH = maxY >= minY ? maxY - minY : 0;
  const bandYTop = cnt ? minY + bboxH / 3 : 0;
  const bandYBottom = cnt ? minY + (2 * bboxH) / 3 : dh;
  return {
    centroidNorm: [cx / dw, cy / dh],
    bboxNorm: {
      minX: minX / dw,
      minY: minY / dh,
      maxX: maxX / dw,
      maxY: maxY / dh,
    },
    bandYTop: bandYTop / dh,
    bandYBottom: bandYBottom / dh,
  };
}

function buildAdjacency(edges: SkGraphEdge[], skipEdgeId?: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push(b);
  };
  for (const e of edges) {
    if (skipEdgeId && e.id === skipEdgeId) continue;
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return m;
}

/** True if removing this edge disconnects its endpoints (bridge) — then edge is not on a simple cycle. */
function isBridgeEdge(allEdges: SkGraphEdge[], e: SkGraphEdge): boolean {
  const adj = buildAdjacency(allEdges, e.id);
  const q: string[] = [e.from];
  const seen = new Set<string>([e.from]);
  while (q.length) {
    const u = q.pop()!;
    if (u === e.to) return false;
    for (const v of adj.get(u) || []) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  }
  return true;
}

function nodeDegrees(edges: SkGraphEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) || 0) + 1);
    d.set(e.to, (d.get(e.to) || 0) + 1);
  }
  return d;
}

function angleBetween(a: Point, b: Point, c: Point): number {
  const ax = a.x - b.x,
    ay = a.y - b.y;
  const cx = c.x - b.x,
    cy = c.y - b.y;
  const la = Math.hypot(ax, ay);
  const lc = Math.hypot(cx, cy);
  if (la < 1e-9 || lc < 1e-9) return 0;
  const dot = (ax * cx + ay * cy) / (la * lc);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function computePathFeatures(
  pixels: Point[],
  w: number,
  h: number,
  anchor: AnchorFrame,
  degFrom: number,
  degTo: number
): Omit<SegmentFeatures, "inCycle"> {
  const n = pixels.length;
  const first = pixels[0]!;
  const last = pixels[n - 1]!;
  const pathLen = n;
  const eucl = Math.hypot(last.x - first.x, last.y - first.y);
  const tort = pathLen / Math.max(eucl, 1e-6);

  let turnSum = 0;
  let turnCount = 0;
  for (let i = 1; i < n - 1; i++) {
    turnSum += angleBetween(pixels[i - 1]!, pixels[i]!, pixels[i + 1]!);
    turnCount++;
  }
  const meanTurn = turnCount ? turnSum / turnCount : 0;

  let sx = 0,
    sy = 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pixels) {
    sx += p.x;
    sy += p.y;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = sx / n;
  const cy = sy / n;
  const dw = Math.max(w - 1, 1);
  const dh = Math.max(h - 1, 1);
  const cxN = cx / dw;
  const cyN = cy / dh;

  const [gcx, gcy] = anchor.centroidNorm;
  const distCent = Math.hypot(cxN - gcx, cyN - gcy);

  const { minX: bx0, maxX: bx1, minY: by0, maxY: by1 } = anchor.bboxNorm;
  const bh = Math.max(by1 - by0, 1e-9);
  const bw = Math.max(bx1 - bx0, 1e-9);
  const verticalPos = (cyN - by0) / bh;
  const hOffset = (cxN - (bx0 + bx1) / 2) / (bw / 2 + 1e-9);

  const orient = Math.atan2(-(last.y - first.y), last.x - first.x);

  return {
    pixelPathLength: pathLen,
    euclideanEndToEnd: eucl,
    tortuosity: tort,
    meanTurnAngle: meanTurn,
    dominantOrientationRad: orient,
    centerNormX: cxN,
    centerNormY: cyN,
    bboxWidthNorm: (maxX - minX) / dw,
    bboxHeightNorm: (maxY - minY) / dh,
    distToGlyphCentroidNorm: distCent,
    verticalPositionInGlyph: Math.max(0, Math.min(1, verticalPos)),
    horizontalOffsetFromGlyphCenter: Math.max(-1, Math.min(1, hOffset)),
    degreeAtFrom: degFrom,
    degreeAtTo: degTo,
  };
}

function computeSegmentFeaturesForEdge(
  e: SkGraphEdge,
  allEdges: SkGraphEdge[],
  w: number,
  h: number,
  anchor: AnchorFrame,
  degrees: Map<string, number>
): SegmentFeatures {
  const inCycle = !isBridgeEdge(allEdges, e);
  const pixels = e.pixels.length >= 2 ? e.pixels : [e.pixels[0]!, e.pixels[0]!];
  const base = computePathFeatures(pixels, w, h, anchor, degrees.get(e.from) || 0, degrees.get(e.to) || 0);
  return {
    ...base,
    inCycle,
  };
}

/**
 * Full pipeline from preprocess (single thinning pass): binary → skeleton → graph → features.
 */
export function extractGlyphGraphFromPreprocess(pre: PreprocessResult, char: string): GlyphGraphExportV1 {
  const w = pre.width;
  const h = pre.height;
  const skPruned = pruneSkeletonSpursPreservingMinorComponents(
    pre.skeleton,
    w,
    h,
    GLYPH_GRAPH_TOPOLOGY_DEFAULTS.pruneSpurMaxLen
  );
  let skGraph = buildSkeletonGraph(skPruned, w, h);
  skGraph = simplifySkeletonGraphByProximity(skGraph, skPruned, w, h, {
    mergeSeparationPx: GLYPH_GRAPH_TOPOLOGY_DEFAULTS.mergeSeparationPx,
  });
  const anchor = computeAnchorFrame(pre.binary, w, h);
  const binCount = countBinaryPixels(pre.binary);
  const skCount = countSkeletonPixels(pre.skeleton);
  const inkRatio = binCount / (w * h);
  const degrees = nodeDegrees(skGraph.edges);

  const topoNodes = skGraph.nodes.map((n: SkGraphNode) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    type: n.type,
  }));
  const topoEdges = skGraph.edges.map((e: SkGraphEdge) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    pixelPathLength: e.pixels.length,
    pixels: e.pixels.map((p) => ({ x: p.x, y: p.y })),
  }));

  const primitives: PrimitiveSegment[] = skGraph.edges.map((e, i) => {
    const features = computeSegmentFeaturesForEdge(e, skGraph.edges, w, h, anchor, degrees);
    return {
      segmentId: `seg_${i}`,
      edgeId: e.id,
      fromNodeId: e.from,
      toNodeId: e.to,
      features,
    };
  });

  const keys: (keyof SegmentFeatures)[] = [
    "pixelPathLength",
    "euclideanEndToEnd",
    "tortuosity",
    "meanTurnAngle",
    "dominantOrientationRad",
    "centerNormX",
    "centerNormY",
    "bboxWidthNorm",
    "bboxHeightNorm",
    "distToGlyphCentroidNorm",
    "verticalPositionInGlyph",
    "horizontalOffsetFromGlyphCenter",
    "inCycle",
    "degreeAtFrom",
    "degreeAtTo",
  ];
  const segmentFeatureMatrix = primitives.map((p) => keys.map((k) => Number(p.features[k])));

  return {
    version: 1,
    char,
    image: { width: w, height: h },
    processing: {
      topologyNodeCount: skGraph.nodes.length,
      topologyEdgeCount: skGraph.edges.length,
      binaryPixelCount: binCount,
      skeletonPixelCount: skCount,
      inkAreaRatio: inkRatio,
    },
    anchors: anchor,
    skeletonTopology: { nodes: topoNodes, edges: topoEdges },
    primitives,
    gnnHint: {
      segmentFeatureKeys: keys,
      segmentFeatureMatrix,
    },
  };
}

/** Raster → preprocess → same as {@link extractGlyphGraphFromPreprocess}. */
export function extractGlyphGraphFromImageData(imageData: ImageData, char: string): GlyphGraphExportV1 {
  return extractGlyphGraphFromPreprocess(runPreprocess(imageData), char);
}
