import { bboxFromMedians } from "@synglyph/chinese-glyph-core";

/** 与 GlyphCanvas 一致：米字格内字形居中（正方形 viewBox） */
export const CHINESE_GLYPH_VIEW_PAD = 0.1;

/** Max CSS size for the Tianzige SVG (annotation + preview). Keep in sync with wrappers. */
export const CHINESE_TIANZIGE_DISPLAY_MAX_W_PX = 620;
export const CHINESE_TIANZIGE_DISPLAY_MAX_H_PX = 700;
export const CHINESE_TIANZIGE_DISPLAY_MAX_VH = 76;

/** Uniform scale for Hanzi strokes + 田字格 in the SVG (centered on the viewBox square). */
export const CHINESE_GLYPH_VISUAL_SCALE = 0.8;

/**
 * Global vertical placement of the Tianzige viewBox relative to the median-stroke bbox,
 * as a fraction of bbox height `h0`.
 *
 * Hanzi coordinates: y increases upward. The viewBox square is centered at
 * `(cx, cy + globalYOffsetFraction * h0)` where `(cx, cy)` is the median bbox center.
 *
 * Default **0** keeps the grid’s geometric center (米字格交点) aligned with the median
 * bbox center in Hanzi space, once the grid is drawn inside the same y-flip group as the
 * glyph (see GlyphCanvas). Use a small non-zero value only if the **filled** outline still
 * looks systematically above/below the median center (not per character).
 */
export const CHINESE_GLYPH_GLOBAL_Y_OFFSET = 0;

export type ViewBox = { x: number; y: number; w: number; h: number };

/**
 * 以全体笔画 median 外接矩形为中心作正方形 viewBox，使字在田字格中几何居中。
 * 解决瘦长字形在矩形 viewBox 中「偏一侧」的视觉问题。
 */
export function squareCenteredViewBoxFromMedians(
  medians: number[][][],
  padFraction: number = CHINESE_GLYPH_VIEW_PAD,
  globalYOffsetFraction: number = CHINESE_GLYPH_GLOBAL_Y_OFFSET
): ViewBox {
  const b = bboxFromMedians(medians);
  const w0 = b.maxX - b.minX;
  const h0 = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2;
  let cy = (b.minY + b.maxY) / 2;
  cy += globalYOffsetFraction * h0;
  const side = Math.max(w0, h0) * (1 + 2 * padFraction);
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}

/**
 * 线性渐变端点：沿源→目标锚点方向，取两区域笔画 median 包络在轴上的投影范围，
 * 使整片选区都参与过渡，而不是仅两锚点之间一条窄带。
 */
export function gradientLineEndpointsForTransition(
  aNorm: { x: number; y: number },
  bNorm: { x: number; y: number },
  box: ViewBox,
  medians: number[][][],
  strokeIdsA: number[],
  strokeIdsB: number[],
  extraNormPoints?: { x: number; y: number }[]
): { x1: number; y1: number; x2: number; y2: number } {
  const ax = box.x + aNorm.x * box.w;
  const ay = box.y + aNorm.y * box.h;
  const bx = box.x + bNorm.x * box.w;
  const by = box.y + bNorm.y * box.h;
  let dx = bx - ax;
  let dy = by - ay;
  let len = Math.hypot(dx, dy);
  const eps = box.w * 1e-5;
  if (len < eps) {
    dx = box.w * 0.04;
    dy = 0;
    len = Math.abs(dx);
  }
  const dirx = dx / len;
  const diry = dy / len;

  const unionIds = [...new Set([...strokeIdsA, ...strokeIdsB])];
  const bb = bboxFromMedianStrokeIndices(medians, unionIds);
  const corners: { x: number; y: number }[] = [];
  if (bb.maxX > bb.minX || bb.maxY > bb.minY) {
    corners.push(
      { x: bb.minX, y: bb.minY },
      { x: bb.maxX, y: bb.minY },
      { x: bb.maxX, y: bb.maxY },
      { x: bb.minX, y: bb.maxY }
    );
  }
  corners.push({ x: ax, y: ay }, { x: bx, y: by });
  if (extraNormPoints) {
    for (const p of extraNormPoints) {
      corners.push({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });
    }
  }

  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of corners) {
    const s = (p.x - ax) * dirx + (p.y - ay) * diry;
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
  }
  if (!Number.isFinite(sMin) || !Number.isFinite(sMax)) {
    return { x1: ax, y1: ay, x2: bx, y2: by };
  }
  if (sMax - sMin < eps) {
    sMax = sMin + box.w * 0.04;
  }

  return {
    x1: ax + dirx * sMin,
    y1: ay + diry * sMin,
    x2: ax + dirx * sMax,
    y2: ay + diry * sMax,
  };
}

function normToAbs(
  n: { x: number; y: number },
  box: ViewBox
): { x: number; y: number } {
  return { x: box.x + n.x * box.w, y: box.y + n.y * box.h };
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * 沿源→目标锚点轴做分段线性颜色过渡；渐变线覆盖 bbox∪锚点投影范围，
 * 各锚点 s 位置与 0%~100% 偏移对应，随锚点移动而明显变化。
 */
export function buildTransitionGradientSpec(
  box: ViewBox,
  medians: number[][][],
  sourceNorm: { x: number; y: number },
  targetNorm: { x: number; y: number },
  /** 沿轴排序后的色标（含源、目标及中间区域），每项为归一化锚点与 RGB */
  stopsAlongAxis: { aNorm: { x: number; y: number }; rgb: [number, number, number] }[],
  unionStrokeIndices: number[]
): { x1: number; y1: number; x2: number; y2: number; stops: { offsetPct: number; r: number; g: number; b: number }[] } {
  const A = normToAbs(sourceNorm, box);
  const B = normToAbs(targetNorm, box);
  let dx = B.x - A.x;
  let dy = B.y - A.y;
  let len = Math.hypot(dx, dy);
  const eps = box.w * 1e-5;
  if (len < eps) {
    dx = box.w * 0.04;
    dy = 0;
    len = Math.abs(dx);
  }
  const dirx = dx / len;
  const diry = dy / len;

  const scalarAt = (px: number, py: number) => (px - A.x) * dirx + (py - A.y) * diry;

  const knots = stopsAlongAxis
    .map((st) => {
      const p = normToAbs(st.aNorm, box);
      return { s: scalarAt(p.x, p.y), rgb: st.rgb };
    })
    .sort((a, b) => a.s - b.s);

  const unionIds = [...new Set(unionStrokeIndices)];
  const bb = bboxFromMedianStrokeIndices(medians, unionIds);
  const corners: { x: number; y: number }[] = [];
  if (bb.maxX > bb.minX || bb.maxY > bb.minY) {
    corners.push(
      { x: bb.minX, y: bb.minY },
      { x: bb.maxX, y: bb.minY },
      { x: bb.maxX, y: bb.maxY },
      { x: bb.minX, y: bb.maxY }
    );
  }
  for (const st of stopsAlongAxis) {
    const p = normToAbs(st.aNorm, box);
    corners.push(p);
  }

  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of corners) {
    const s = scalarAt(p.x, p.y);
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
  }
  if (!Number.isFinite(sMin) || !Number.isFinite(sMax)) {
    const ax = A.x;
    const ay = A.y;
    const bx = B.x;
    const by = B.y;
    return {
      x1: ax,
      y1: ay,
      x2: bx,
      y2: by,
      stops: [
        { offsetPct: 0, r: knots[0]?.rgb[0] ?? 128, g: knots[0]?.rgb[1] ?? 128, b: knots[0]?.rgb[2] ?? 128 },
        {
          offsetPct: 100,
          r: knots[knots.length - 1]?.rgb[0] ?? 128,
          g: knots[knots.length - 1]?.rgb[1] ?? 128,
          b: knots[knots.length - 1]?.rgb[2] ?? 128,
        },
      ],
    };
  }
  if (sMax - sMin < eps) {
    sMax = sMin + box.w * 0.04;
  }

  const x1 = A.x + dirx * sMin;
  const y1 = A.y + diry * sMin;
  const x2 = A.x + dirx * sMax;
  const y2 = A.y + diry * sMax;
  const span = sMax - sMin;

  const colorAtS = (s: number): [number, number, number] => {
    if (knots.length === 0) return [128, 128, 128];
    if (s <= knots[0].s) return knots[0].rgb;
    if (s >= knots[knots.length - 1].s) return knots[knots.length - 1].rgb;
    for (let i = 0; i < knots.length - 1; i++) {
      const a = knots[i]!;
      const b = knots[i + 1]!;
      if (s >= a.s && s <= b.s) {
        const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
        return lerpRgb(a.rgb, b.rgb, t);
      }
    }
    return knots[knots.length - 1]!.rgb;
  };

  const criticalS = new Set<number>([sMin, sMax]);
  for (const k of knots) {
    criticalS.add(k.s);
  }
  const sortedS = [...criticalS].filter((s) => s >= sMin - eps && s <= sMax + eps).sort((a, b) => a - b);

  const outStops: { offsetPct: number; r: number; g: number; b: number }[] = [];
  for (const s of sortedS) {
    const u = (s - sMin) / span;
    const [r, g, b] = colorAtS(s);
    outStops.push({ offsetPct: Math.max(0, Math.min(100, u * 100)), r, g, b });
  }

  const deduped: typeof outStops = [];
  for (const st of outStops) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      Math.abs(prev.offsetPct - st.offsetPct) < 0.02 &&
      prev.r === st.r &&
      prev.g === st.g &&
      prev.b === st.b
    ) {
      continue;
    }
    deduped.push(st);
  }

  return { x1, y1, x2, y2, stops: deduped.length >= 2 ? deduped : outStops };
}

export function bboxFromMedianStrokeIndices(
  medians: number[][][],
  strokeIndices: number[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const si of strokeIndices) {
    if (typeof si !== "number" || si < 0 || si >= medians.length) continue;
    const stroke = medians[si];
    if (!stroke) continue;
    for (const pt of stroke) {
      const x = pt[0]!;
      const y = pt[1]!;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * 区域锚点：该部件所含笔画 median 包络的几何中心，归一化到当前 viewBox。
 * 比固定 (0.5,0.5) 更能代表「部件中心」。
 */
export function normalizedAnchorFromStrokeMedians(
  medians: number[][][],
  strokeIds: number[] | null | undefined,
  box: ViewBox
): { x: number; y: number } {
  const ids = strokeIds?.filter((i) => typeof i === "number") ?? [];
  if (ids.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const sub = bboxFromMedianStrokeIndices(medians, ids);
  const cx = (sub.minX + sub.maxX) / 2;
  const cy = (sub.minY + sub.maxY) / 2;
  return {
    x: (cx - box.x) / box.w,
    y: (cy - box.y) / box.h,
  };
}

/** 优先使用区域已保存的 anchor_json，否则按笔画 median 包络中心。 */
/** 按源→目标锚点轴上的投影标量对区域 id 排序（用于多段过渡色标顺序） */
export function sortRegionIdsOnTransitionAxis(
  ids: string[],
  sourceId: string,
  targetId: string,
  regions: { id: string; anchor_json?: { x: number; y: number } | null; stroke_ids_json: number[] | null }[],
  medians: number[][][],
  box: ViewBox
): string[] {
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const src = regionById.get(sourceId);
  const tgt = regionById.get(targetId);
  if (!src || !tgt) return [...new Set(ids)];
  const an = regionAnchorNorm(src, medians, box);
  const bn = regionAnchorNorm(tgt, medians, box);
  const ax = box.x + an.x * box.w;
  const ay = box.y + an.y * box.h;
  const bx = box.x + bn.x * box.w;
  const by = box.y + bn.y * box.h;
  let dx = bx - ax;
  let dy = by - ay;
  let len = Math.hypot(dx, dy);
  const eps = box.w * 1e-6;
  if (len < eps) {
    dx = box.w * 0.04;
    dy = 0;
    len = Math.abs(dx);
  }
  const dirx = dx / len;
  const diry = dy / len;
  const scalar = (id: string) => {
    const r = regionById.get(id);
    if (!r) return 0;
    const n = regionAnchorNorm(r, medians, box);
    const px = box.x + n.x * box.w;
    const py = box.y + n.y * box.h;
    return (px - ax) * dirx + (py - ay) * diry;
  };
  return [...new Set(ids)].sort((a, b) => scalar(a) - scalar(b));
}

export function regionAnchorNorm(
  reg: { anchor_json?: { x: number; y: number } | null; stroke_ids_json: number[] | null },
  medians: number[][][],
  box: ViewBox
): { x: number; y: number } {
  const j = reg.anchor_json;
  if (
    j &&
    typeof j.x === "number" &&
    typeof j.y === "number" &&
    Number.isFinite(j.x) &&
    Number.isFinite(j.y)
  ) {
    return { x: Math.max(0, Math.min(1, j.x)), y: Math.max(0, Math.min(1, j.y)) };
  }
  return normalizedAnchorFromStrokeMedians(medians, reg.stroke_ids_json, box);
}
