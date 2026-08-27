/**
 * Rule-based piece label suggestions: geometry + full-glyph ray heuristic for opening.
 */

import type { Point } from "./preprocess";
import { verticalInGlyphFromGrid } from "./glyphGridBands";
import type {
  GlyphPiece,
  LineStrokeKind,
  MarkKind,
  OpeningDir,
  OrientationClass,
  PieceType,
  SideInGlyph,
} from "./glyphSchema";

function pixKey(p: Point) {
  return `${p.x},${p.y}`;
}

function getBin(bin: Uint8Array, w: number, x: number, y: number): number {
  return bin[y * w + x] ? 1 : 0;
}

function neighborCountInSet(p: Point, set: Set<string>, w: number, h: number): number {
  let c = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = p.x + dx,
        ny = p.y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && set.has(pixKey({ x: nx, y: ny }))) c++;
    }
  }
  return c;
}

function bboxOf(pixels: Point[]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return [minX, minY, maxX, maxY];
}

function centroidOf(pixels: Point[]): Point {
  let sx = 0,
    sy = 0;
  for (const p of pixels) {
    sx += p.x;
    sy += p.y;
  }
  const n = pixels.length || 1;
  return { x: sx / n, y: sy / n };
}

function pcaMajorAngle(pixels: Point[]): number {
  const c = centroidOf(pixels);
  let cxx = 0,
    cxy = 0,
    cyy = 0;
  for (const p of pixels) {
    const dx = p.x - c.x,
      dy = p.y - c.y;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  const n = pixels.length || 1;
  cxx /= n;
  cxy /= n;
  cyy /= n;
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, trace * trace / 4 - det);
  const l1 = trace / 2 + Math.sqrt(disc);
  const vx = Math.abs(cxy) < 1e-9 ? 1 : cxy;
  const vy = l1 - cxx;
  const len = Math.hypot(vx, vy) || 1;
  return Math.atan2(vy, vx);
}

function straightnessEstimate(pixels: Point[], angle: number): number {
  const c = centroidOf(pixels);
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  let sum = 0;
  for (const p of pixels) {
    const dx = p.x - c.x,
      dy = p.y - c.y;
    const perp = Math.abs(-uy * dx + ux * dy);
    sum += perp;
  }
  return 1 - Math.min(1, sum / (pixels.length * 3 + 1e-6));
}

function meanCurvatureProxy(pixels: Point[], set: Set<string>, w: number, h: number): number {
  let turns = 0;
  for (const p of pixels) {
    const neigh = [
      { x: p.x - 1, y: p.y },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y - 1 },
      { x: p.x, y: p.y + 1 },
    ].filter((q) => set.has(pixKey(q)));
    if (neigh.length === 2) {
      const [a, b] = neigh;
      const dot =
        (a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y);
      if (dot < 0) turns++;
    }
  }
  return turns / (pixels.length + 1e-6);
}

function sideInGlyph(cxNorm: number): SideInGlyph {
  if (cxNorm < 0.38) return "left";
  if (cxNorm > 0.62) return "right";
  return "center";
}

function orientationFromAngle(deg: number): OrientationClass {
  const a = Math.abs(deg % 180);
  if (a < 25 || a > 155) return "vertical";
  if (a > 65 && a < 115) return "horizontal";
  if (a > 35 && a < 145) return "diagonal";
  return "curved";
}

function orientToLineStroke(o: OrientationClass): LineStrokeKind {
  if (o === "vertical") return "vertical";
  if (o === "horizontal") return "horizontal";
  if (o === "diagonal") return "diagonal";
  return "na";
}

/**
 * 两段端点连线向量 → 竖/横/斜。阈值与 glyphSegmentation.snapNearlyVerticalToColumn 一致（仅近竖/近横才归类，避免斜线误判）。
 */
function orientationFromEndpointDelta(dx: number, dy: number): OrientationClass {
  const len = Math.hypot(dx, dy) || 1;
  const horizFrac = Math.abs(dx) / len;
  const vertFrac = Math.abs(dy) / len;
  if (horizFrac <= 0.14) return "vertical";
  if (vertFrac <= 0.14) return "horizontal";
  return "diagonal";
}

/**
 * Shortest cardinal ray from centroid until leaving full-glyph ink → opening side (bowl / arc).
 */
function openingDirByRayFromCentroid(
  cen: Point,
  glyphBinary: Uint8Array,
  w: number,
  h: number
): OpeningDir {
  const cx = Math.round(Math.max(0, Math.min(w - 1, cen.x)));
  const cy = Math.round(Math.max(0, Math.min(h - 1, cen.y)));
  if (!getBin(glyphBinary, w, cx, cy)) return "none";
  const dirs: { dx: number; dy: number; o: OpeningDir }[] = [
    { dx: -1, dy: 0, o: "left" },
    { dx: 1, dy: 0, o: "right" },
    { dx: 0, dy: -1, o: "up" },
    { dx: 0, dy: 1, o: "down" },
  ];
  let best = Infinity;
  let bestO: OpeningDir = "none";
  for (const { dx, dy, o } of dirs) {
    let t = 0;
    for (; t <= Math.max(w, h) + 2; t++) {
      const x = cx + dx * t;
      const y = cy + dy * t;
      if (x < 0 || x >= w || y < 0 || y >= h || !getBin(glyphBinary, w, x, y)) break;
    }
    if (t < best) {
      best = t;
      bestO = o;
    }
  }
  return bestO;
}

/** Same as cardinal-ray heuristic but ink = this piece's foreground only (bowl opening = shortest escape from piece). */
function openingDirByRayFromPieceMask(
  cen: Point,
  pieceMask: Uint8Array,
  w: number,
  h: number
): OpeningDir {
  function seedInMask(): Point | null {
    const ix = Math.round(cen.x),
      iy = Math.round(cen.y);
    if (ix >= 0 && ix < w && iy >= 0 && iy < h && pieceMask[iy * w + ix]) return { x: ix, y: iy };
    for (let r = 1; r <= 24; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = ix + dx,
            y = iy + dy;
          if (x >= 0 && x < w && y >= 0 && y < h && pieceMask[y * w + x]) return { x, y };
        }
      }
    }
    return null;
  }
  const seed = seedInMask();
  if (!seed) return "none";
  const cx = seed.x,
    cy = seed.y;
  const dirs: { dx: number; dy: number; o: OpeningDir }[] = [
    { dx: -1, dy: 0, o: "left" },
    { dx: 1, dy: 0, o: "right" },
    { dx: 0, dy: -1, o: "up" },
    { dx: 0, dy: 1, o: "down" },
  ];
  let best = Infinity;
  let bestO: OpeningDir = "none";
  for (const { dx, dy, o } of dirs) {
    let t = 0;
    for (; t <= Math.max(w, h) + 2; t++) {
      const x = cx + dx * t;
      const y = cy + dy * t;
      if (x < 0 || x >= w || y < 0 || y >= h || !pieceMask[y * w + x]) break;
    }
    if (t < best) {
      best = t;
      bestO = o;
    }
  }
  return bestO;
}

function neighborsInSkSkeleton(p: Point, skSet: Set<string>, w: number, h: number): Point[] {
  const o: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = p.x + dx,
        ny = p.y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && skSet.has(pixKey({ x: nx, y: ny }))) o.push({ x: nx, y: ny });
    }
  }
  return o;
}

function bfsSkeletonPath(
  start: Point,
  goal: Point,
  skSet: Set<string>,
  w: number,
  h: number
): Point[] | null {
  const goalKey = pixKey(goal);
  const q: Point[] = [start];
  const prev = new Map<string, string>();
  const seen = new Set<string>();
  seen.add(pixKey(start));
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++]!;
    const pk = pixKey(p);
    if (pk === goalKey) {
      const out: Point[] = [];
      let cur: string | undefined = pk;
      while (cur) {
        const [x, y] = cur.split(",").map(Number) as [number, number];
        out.push({ x, y });
        cur = prev.get(cur);
      }
      return out.reverse();
    }
    for (const n of neighborsInSkSkeleton(p, skSet, w, h)) {
      const nk = pixKey(n);
      if (seen.has(nk)) continue;
      seen.add(nk);
      prev.set(nk, pk);
      q.push(n);
    }
  }
  return null;
}

function skeletonEndpoints(topoPts: Point[], skSet: Set<string>, w: number, h: number): Point[] {
  const eps: Point[] = [];
  for (const p of topoPts) {
    if (neighborCountInSet(p, skSet, w, h) === 1) eps.push(p);
  }
  return eps;
}

function diameterPairEndpoints(eps: Point[]): [Point, Point] | null {
  if (eps.length < 2) return null;
  let bestI = 0,
    bestJ = 1,
    bestD = -1;
  for (let i = 0; i < eps.length; i++) {
    for (let j = i + 1; j < eps.length; j++) {
      const a = eps[i]!,
        b = eps[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > bestD) {
        bestD = d;
        bestI = i;
        bestJ = j;
      }
    }
  }
  return [eps[bestI]!, eps[bestJ]!];
}

/** 直线类：用骨架端点（恰两个则取这两点，否则取最远端点对）连线方向判定朝向。 */
function lineOrientationFromSkeletonEndpoints(
  topoPts: Point[],
  topoSet: Set<string>,
  w: number,
  h: number
): OrientationClass | null {
  const eps = skeletonEndpoints(topoPts, topoSet, w, h);
  if (eps.length < 2) return null;
  const pair: [Point, Point] =
    eps.length === 2 ? [eps[0]!, eps[1]!] : diameterPairEndpoints(eps) ?? [eps[0]!, eps[1]!];
  const dx = pair[1].x - pair[0].x;
  const dy = pair[1].y - pair[0].y;
  return orientationFromEndpointDelta(dx, dy);
}

function meanDeviationFromChord(path: Point[], a: Point, b: Point): number {
  const ax = b.x - a.x,
    ay = b.y - a.y;
  const len = Math.hypot(ax, ay) || 1;
  let sum = 0;
  for (const p of path) {
    const cross = Math.abs((p.x - a.x) * ay - (p.y - a.y) * ax);
    sum += cross / len;
  }
  return sum / path.length;
}

function openingLabelCn(o: OpeningDir): string {
  const m: Record<string, string> = {
    left: "左",
    right: "右",
    up: "上",
    down: "下",
    none: "无",
  };
  return m[o] ?? o;
}

export interface SuggestInput {
  pixels: Point[];
  skeletonPixels?: Point[];
  /** Full glyph binary mask (same w,h) for opening-ray heuristic. */
  glyphBinary: Uint8Array;
  componentId: number;
  pieceId: string;
  w: number;
  h: number;
  glyphBboxNorm: [number, number, number, number];
}

export function suggestPiece(input: SuggestInput): Omit<
  GlyphPiece,
  "notes" | "subtype" | "suggested_subtype"
> & { suggested_subtype?: string } {
  const { pixels, skeletonPixels, glyphBinary, componentId, pieceId, w, h, glyphBboxNorm } = input;
  const topoPts =
    skeletonPixels && skeletonPixels.length > 0 ? skeletonPixels : pixels;
  const topoSet = new Set(topoPts.map(pixKey));
  let endpoints = 0;
  let allDeg2 = topoPts.length > 0;
  for (const p of topoPts) {
    const nc = neighborCountInSet(p, topoSet, w, h);
    if (nc === 1) endpoints++;
    if (nc !== 2) allDeg2 = false;
  }
  const closed = endpoints === 0 && topoPts.length > 4 && allDeg2;
  const [bx0, by0, bx1, by1] = bboxOf(pixels);
  const gw = bx1 - bx0 + 1e-6,
    gh = by1 - by0 + 1e-6;
  const aspect = gw / gh;
  const area = pixels.length;
  const angle = pcaMajorAngle(pixels);
  const deg = (angle * 180) / Math.PI;
  const straight = straightnessEstimate(pixels, angle);
  const curv = meanCurvatureProxy(topoPts, topoSet, w, h);
  const cen = centroidOf(pixels);
  const cxNorm = cen.x / Math.max(1, w - 1);
  const cyNorm = cen.y / Math.max(1, h - 1);
  const side = sideInGlyph(cxNorm);
  const layer = verticalInGlyphFromGrid(cyNorm, h);
  const orient = straight > 0.72 ? orientationFromAngle(deg) : "curved";

  const pieceMask = new Uint8Array(w * h);
  for (const p of pixels) pieceMask[p.y * w + p.x] = 1;
  const openingGlyph = openingDirByRayFromCentroid(cen, glyphBinary, w, h);
  const openingPiece = openingDirByRayFromPieceMask(cen, pieceMask, w, h);
  const resolveOpening = (): OpeningDir =>
    openingPiece !== "none" ? openingPiece : openingGlyph;

  /** Straightness along skeleton between two farthest endpoints (chord deviation); falls back to PCA `straight`. */
  let inkStraight = straight;
  let pathUsed = false;
  const useSkPath = Boolean(skeletonPixels && skeletonPixels.length > 0);
  const skEpsForPath = useSkPath ? skeletonEndpoints(topoPts, topoSet, w, h) : [];
  if (useSkPath && skEpsForPath.length >= 2) {
    const pair = diameterPairEndpoints(skEpsForPath);
    if (pair) {
      const path = bfsSkeletonPath(pair[0], pair[1], topoSet, w, h);
      if (path && path.length >= 4) {
        const chordLen = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
        const meanDev = meanDeviationFromChord(path, pair[0], pair[1]);
        inkStraight = 1 - Math.min(1, meanDev / (chordLen * 0.4 + 3));
        pathUsed = true;
      }
    }
  }

  let type: PieceType = "unknown";
  let suggested_subtype: string | undefined;
  let mark_kind: MarkKind = "none";
  let line_stroke: LineStrokeKind = "na";
  let opening_dir_applicable = false;
  let opening_dir: OpeningDir = "none";

  const inkFrac = area / Math.max(1, w * h);
  const isDotLike =
    area < 200 &&
    inkFrac < 0.04 &&
    aspect > 0.5 &&
    aspect < 2.0 &&
    endpoints <= 2 &&
    straight < 0.55;

  if (isDotLike) {
    type = "dot";
    mark_kind = "dot";
    suggested_subtype = "tittle";
    line_stroke = "na";
    opening_dir_applicable = false;
    opening_dir = "none";
  } else if (closed && curv > 0.06) {
    type = "loop";
    opening_dir_applicable = false;
    opening_dir = "none";
    suggested_subtype = "closed";
  } else if (endpoints === 2 && inkStraight > 0.7 && aspect > 2.2 && orient === "vertical") {
    type = "line";
    line_stroke = "vertical";
    suggested_subtype = "vertical_stroke";
    opening_dir_applicable = false;
    opening_dir = "none";
  } else if (endpoints === 2 && inkStraight > 0.7 && aspect < 0.48 && orient === "horizontal") {
    type = "line";
    line_stroke = "horizontal";
    suggested_subtype = "horizontal_stroke";
    opening_dir_applicable = false;
    opening_dir = "none";
  } else if (endpoints === 2 && inkStraight > 0.62 && orient === "diagonal") {
    type = "diagonal";
    line_stroke = "diagonal";
    opening_dir_applicable = false;
    opening_dir = "none";
  } else if (endpoints === 2 && (curv > 0.08 || orient === "curved" || inkStraight < 0.72)) {
    type = "arc";
    opening_dir_applicable = true;
    opening_dir = resolveOpening();
    suggested_subtype = `bowl_opening_${opening_dir}`;
  } else if (endpoints === 1 && area < 100 && curv > 0.04) {
    type = "hook";
    opening_dir_applicable = true;
    opening_dir = resolveOpening();
  } else if (endpoints === 2 && inkStraight > 0.58) {
    type = "line";
    line_stroke = orientToLineStroke(orientationFromAngle(deg));
    suggested_subtype = "stroke";
    opening_dir_applicable = false;
    opening_dir = "none";
  } else if (endpoints === 2) {
    type = "arc";
    opening_dir_applicable = true;
    opening_dir = resolveOpening();
    suggested_subtype = `bowl_opening_${opening_dir}`;
  } else if (pathUsed && !closed && inkStraight < 0.68) {
    type = "arc";
    opening_dir_applicable = true;
    opening_dir = resolveOpening();
    suggested_subtype = `bowl_opening_${opening_dir}_path`;
  }

  const lineOrientFromEndpoints =
    type === "line" ? lineOrientationFromSkeletonEndpoints(topoPts, topoSet, w, h) : null;
  const effectiveLineStroke: LineStrokeKind =
    type === "line" && lineOrientFromEndpoints
      ? orientToLineStroke(lineOrientFromEndpoints)
      : line_stroke;

  const parts: string[] = [];
  if (type === "dot") parts.push("小圆点/附标（如 i 的点）");
  else if (type === "diagonal") {
    parts.push("斜向笔画");
    parts.push("无开口方向（不适用 opening）");
  } else if (type === "line") {
    parts.push(
      `直线笔画（${effectiveLineStroke === "vertical" ? "竖" : effectiveLineStroke === "horizontal" ? "横" : effectiveLineStroke === "diagonal" ? "斜" : "向"}）`
    );
    if (lineOrientFromEndpoints) parts.push("方向由骨架两端点连线判定");
    parts.push("无开口方向（不适用 opening）");
  } else if (type === "loop") parts.push("闭合环");
  else if (type === "arc") {
    parts.push("弧/碗状开口笔画");
    parts.push(`开口朝${openingLabelCn(opening_dir)}`);
    parts.push("弯曲");
  } else if (type === "hook") {
    parts.push("钩形");
    if (opening_dir_applicable) parts.push(`开口参考${openingLabelCn(opening_dir)}`);
  } else parts.push("待确认");

  parts.push(
    `glyph 内左右偏${side === "left" ? "左" : side === "right" ? "右" : "中"}、上下偏${layer === "top" ? "上" : layer === "bottom" ? "下" : "中"}`
  );

  const auto_description = parts.join("；");

  const bbox_piece: [number, number, number, number] = [
    bx0 / Math.max(1, w - 1),
    by0 / Math.max(1, h - 1),
    bx1 / Math.max(1, w - 1),
    by1 / Math.max(1, h - 1),
  ];

  return {
    piece_id: pieceId,
    source_component_id: componentId,
    type,
    suggested_type: type,
    suggested_subtype,
    side_in_glyph: side,
    vertical_in_glyph: layer,
    endpoints: { node_ids: [], coords_norm: [] },
    centroid: [cxNorm, cyNorm],
    orientation_class:
      type === "line" && lineOrientFromEndpoints
        ? lineOrientFromEndpoints
        : type === "diagonal"
          ? "diagonal"
          : type === "line" && line_stroke !== "na"
            ? line_stroke === "vertical"
              ? "vertical"
              : line_stroke === "horizontal"
                ? "horizontal"
                : "diagonal"
            : type === "dot"
              ? "curved"
              : orient,
    opening_dir,
    opening_dir_applicable,
    line_stroke: effectiveLineStroke,
    mark_kind,
    auto_description,
    closed,
    bbox_piece,
    confidence: Math.min(
      0.92,
      0.42 +
        inkStraight * 0.22 +
        (closed ? 0.12 : 0) +
        (type !== "unknown" ? 0.14 : 0) +
        (opening_dir_applicable && opening_dir !== "none" ? 0.08 : 0) +
        (opening_dir_applicable && openingPiece !== "none" && openingPiece === openingGlyph ? 0.04 : 0)
    ),
  };
}
