/**
 * Apply cut markers as blocked skeleton pixels; connected components = pieces.
 */

import type { Point } from "./preprocess";

function getSk(sk: Uint8Array, w: number, x: number, y: number) {
  return sk[y * w + x] ? 1 : 0;
}

function setSk(sk: Uint8Array, w: number, x: number, y: number, v: number) {
  sk[y * w + x] = v ? 1 : 0;
}

function neighbors8(p: Point, w: number, h: number): Point[] {
  const o: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = p.x + dx,
        ny = p.y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) o.push({ x: nx, y: ny });
    }
  }
  return o;
}

export interface CutPixel {
  x: number;
  y: number;
  radius: number;
}

/** Block a square neighborhood on skeleton copy */
export function applyCutsToSkeleton(
  skeleton: Uint8Array,
  w: number,
  h: number,
  cuts: CutPixel[]
): Uint8Array {
  const out = new Uint8Array(skeleton);
  for (const c of cuts) {
    const r = c.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx,
          y = c.y + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) setSk(out, w, x, y, 0);
      }
    }
  }
  return out;
}

export interface PieceComponent {
  id: number;
  pixels: Point[];
}

export function connectedComponentsSkeleton(
  sk: Uint8Array,
  w: number,
  h: number
): PieceComponent[] {
  const vis = new Uint8Array(w * h);
  const comps: PieceComponent[] = [];
  let cid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getSk(sk, w, x, y) || vis[y * w + x]) continue;
      const pixels: Point[] = [];
      const q: Point[] = [{ x, y }];
      vis[y * w + x] = 1;
      while (q.length) {
        const p = q.pop()!;
        pixels.push(p);
        for (const n of neighbors8(p, w, h)) {
          const ni = n.y * w + n.x;
          if (getSk(sk, w, n.x, n.y) && !vis[ni]) {
            vis[ni] = 1;
            q.push(n);
          }
        }
      }
      comps.push({ id: cid++, pixels });
    }
  }
  return comps;
}

function getBin(bin: Uint8Array, w: number, x: number, y: number): number {
  return bin[y * w + x] ? 1 : 0;
}

/**
 * Multi-source geodesic BFS inside the binary mask: each foreground pixel gets the
 * label of the nearest skeleton component (8-connected path length).
 * Ties: smaller component index wins.
 * Background → -1. Unreachable foreground (should be rare) → -1.
 */
export function assignForegroundByGeodesicToComponents(
  binary: Uint8Array,
  w: number,
  h: number,
  components: PieceComponent[]
): Int32Array {
  const nComp = components.length;
  const INF = 0x7fffffff;
  const dist = new Int32Array(w * h).fill(INF);
  const label = new Int32Array(w * h).fill(-1);
  const maxDist = w * h + 4;
  const buckets: Point[][] = Array.from({ length: maxDist }, () => []);

  for (let cid = 0; cid < nComp; cid++) {
    for (const p of components[cid].pixels) {
      if (!getBin(binary, w, p.x, p.y)) continue;
      const i = p.y * w + p.x;
      dist[i] = 0;
      label[i] = cid;
      buckets[0].push({ x: p.x, y: p.y });
    }
  }

  for (let d = 0; d < maxDist; d++) {
    const b = buckets[d];
    for (let k = 0; k < b.length; k++) {
      const p = b[k]!;
      const i = p.y * w + p.x;
      if (dist[i] !== d) continue;
      const lab = label[i];
      for (const n of neighbors8(p, w, h)) {
        if (!getBin(binary, w, n.x, n.y)) continue;
        const ni = n.y * w + n.x;
        const nd = d + 1;
        if (nd >= maxDist) continue;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          label[ni] = lab;
          buckets[nd].push(n);
        } else if (nd === dist[ni] && lab < label[ni]) {
          label[ni] = lab;
        }
      }
    }
    b.length = 0;
  }

  return label;
}

/** Collect foreground pixels per component label (0..nComp-1). */
export function collectPixelsPerLabel(
  label: Int32Array,
  binary: Uint8Array,
  w: number,
  h: number,
  nComp: number
): Point[][] {
  const out: Point[][] = Array.from({ length: nComp }, () => []);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getBin(binary, w, x, y)) continue;
      const L = label[y * w + x];
      if (L >= 0 && L < nComp) {
        out[L]!.push({ x, y });
      }
    }
  }
  return out;
}
