/**
 * Line-cut band subtraction + foreground connected components (4-connectivity for pieces).
 */

import type { Point } from "./preprocess";

function getB(bin: Uint8Array, w: number, x: number, y: number): number {
  return bin[y * w + x] ? 1 : 0;
}

function setB(bin: Uint8Array, w: number, x: number, y: number, v: number) {
  bin[y * w + x] = v ? 1 : 0;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
function pointSegDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax,
    aby = by - ay;
  const apx = px - ax,
    apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-9;
  let t = (apx * abx + apy * apy) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx,
    qy = ay + t * aby;
  const dx = px - qx,
    dy = py - qy;
  return dx * dx + dy * dy;
}

/**
 * Vertical strip only between y0..y1 (user-drawn extent), not full canvas height.
 */
/** Inclusive pixel rect; optional clip for carving. */
export type PixelClipRect = { minX: number; minY: number; maxX: number; maxY: number };

function inClip(x: number, y: number, clip: PixelClipRect | undefined): boolean {
  if (!clip) return true;
  return x >= clip.minX && x <= clip.maxX && y >= clip.minY && y <= clip.maxY;
}

/**
 * @param protectedStrip — 竖向切割带经过此矩形时**不**擦除前景（用于保留横笔连通，避免竖切把横笔挖成多块）。
 */
export function subtractVerticalStripBounded(
  mask: Uint8Array,
  w: number,
  h: number,
  xc: number,
  y0: number,
  y1: number,
  halfWidth: number,
  clip?: PixelClipRect,
  protectedStrip?: PixelClipRect
): void {
  const hw = Math.max(halfWidth, 1);
  const yLo = Math.max(0, Math.floor(Math.min(y0, y1)));
  const yHi = Math.min(h - 1, Math.ceil(Math.max(y0, y1)));
  const x0 = Math.max(0, Math.floor(xc - hw));
  const x1 = Math.min(w - 1, Math.ceil(xc + hw));
  for (let y = yLo; y <= yHi; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inClip(x, y, clip)) continue;
      if (protectedStrip && inClip(x, y, protectedStrip)) continue;
      setB(mask, w, x, y, 0);
    }
  }
}

/**
 * Erase foreground pixels within `halfWidth` (in pixels) of the line segment [a,b].
 */
export function subtractLineBand(
  mask: Uint8Array,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfWidth: number,
  clip?: PixelClipRect
): void {
  const pad = Math.ceil(halfWidth) + 2;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + pad));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by) + pad));
  const effW = Math.max(halfWidth + 0.35, 1);
  const r2 = effW * effW;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inClip(x, y, clip)) continue;
      if (!getB(mask, w, x, y)) continue;
      if (pointSegDistSq(x, y, ax, ay, bx, by) <= r2 + 1e-6) setB(mask, w, x, y, 0);
    }
  }
}

/** clip_norm 两角点 → 像素 inclusive 矩形 */
export function pixelClipFromNormCorners(
  corners: [[number, number], [number, number]],
  w: number,
  h: number
): PixelClipRect {
  const x0 = corners[0][0] * Math.max(1, w - 1);
  const y0 = corners[0][1] * Math.max(1, h - 1);
  const x1 = corners[1][0] * Math.max(1, w - 1);
  const y1 = corners[1][1] * Math.max(1, h - 1);
  const minX = Math.max(0, Math.min(Math.floor(Math.min(x0, x1)), w - 1));
  const maxX = Math.min(w - 1, Math.max(Math.ceil(Math.max(x0, x1)), 0));
  const minY = Math.max(0, Math.min(Math.floor(Math.min(y0, y1)), h - 1));
  const maxY = Math.min(h - 1, Math.max(Math.ceil(Math.max(y0, y1)), 0));
  return { minX, minY, maxX, maxY };
}

function neighbors8(x: number, y: number, w: number, h: number): [number, number][] {
  const o: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx,
        ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) o.push([nx, ny]);
    }
  }
  return o;
}

/** 4-neighbors only (no diagonals). After a narrow cut, 8-conn can still bridge via corners. */
function neighbors4(x: number, y: number, w: number, h: number): [number, number][] {
  const o: [number, number][] = [];
  if (x > 0) o.push([x - 1, y]);
  if (x + 1 < w) o.push([x + 1, y]);
  if (y > 0) o.push([x, y - 1]);
  if (y + 1 < h) o.push([x, y + 1]);
  return o;
}

export interface SegmentationResult {
  /** Per-pixel component index, -1 = background */
  label: Int32Array;
  /** Foreground pixels grouped by component id */
  components: Point[][];
  /** Number of foreground components */
  nComp: number;
}

export type Connectivity4Or8 = 4 | 8;

/**
 * Connected components on `mask` where mask[x,y]===1.
 * Use connectivity 4 after line cuts so diagonal pixels do not re-bridge a narrow gap.
 */
export function connectedComponentsForeground(
  mask: Uint8Array,
  w: number,
  h: number,
  connectivity: Connectivity4Or8 = 8
): SegmentationResult {
  const neigh =
    connectivity === 4
      ? neighbors4
      : (x: number, y: number, w0: number, h0: number) => neighbors8(x, y, w0, h0);
  const label = new Int32Array(w * h).fill(-1);
  const components: Point[][] = [];
  let cid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!getB(mask, w, x, y) || label[i] >= 0) continue;
      const pix: Point[] = [];
      const q: Point[] = [{ x, y }];
      label[i] = cid;
      let qi = 0;
      while (qi < q.length) {
        const p = q[qi++]!;
        pix.push(p);
        for (const [nx, ny] of neigh(p.x, p.y, w, h)) {
          const ni = ny * w + nx;
          if (!getB(mask, w, nx, ny) || label[ni] >= 0) continue;
          label[ni] = cid;
          q.push({ x: nx, y: ny });
        }
      }
      components.push(pix);
      cid++;
    }
  }
  return { label, components, nComp: components.length };
}

/**
 * Snap nearly-vertical strokes to a single pixel column, but keep the user's y extent
 * (does not extend to full canvas — avoids splitting unrelated ink above/below).
 */
export function snapNearlyVerticalToColumn(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  w: number,
  _h: number
): { ax: number; ay: number; bx: number; by: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const horizFrac = Math.abs(dx) / len;
  const nearVertical = horizFrac <= 0.14;
  if (nearVertical) {
    const x = Math.round((ax + bx) / 2);
    const xc = Math.max(0, Math.min(w - 1, x));
    return { ax: xc, ay, bx: xc, by };
  }
  return { ax, ay, bx, by };
}

/**
 * Copy binary mask, apply all line cuts (subtract bands), then segment.
 * Uses 4-connectivity so a carved gap is not closed again by diagonal ink neighbors.
 */
export function segmentGlyphByLineCuts(
  binary: Uint8Array,
  w: number,
  h: number,
  cuts: {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    halfWidth: number;
    clip?: PixelClipRect;
  }[],
  opts?: { verticalStripProtected?: PixelClipRect }
): SegmentationResult {
  const prot = opts?.verticalStripProtected;
  const mask = new Uint8Array(binary);
  for (const c of cuts) {
    const s = snapNearlyVerticalToColumn(c.ax, c.ay, c.bx, c.by, w, h);
    const ax = s.ax,
      ay = s.ay,
      bx = s.bx,
      by = s.by;
    const columnSpan = Math.abs(ax - bx);
    const clip = c.clip;
    if (columnSpan <= 0.5) {
      const xc = Math.round((ax + bx) / 2);
      const xcClamped = Math.max(0, Math.min(w - 1, xc));
      const y0 = Math.min(ay, by);
      const y1 = Math.max(ay, by);
      subtractVerticalStripBounded(mask, w, h, xcClamped, y0, y1, c.halfWidth, clip, prot);
    } else {
      subtractLineBand(mask, w, h, ax, ay, bx, by, c.halfWidth, clip);
    }
  }
  return connectedComponentsForeground(mask, w, h, 4);
}
