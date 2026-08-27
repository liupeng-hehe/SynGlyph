/**
 * Pruned skeleton graph: nodes at endpoints/junctions, edges = pixel paths.
 */

import type { Point } from "./preprocess";

function key(p: Point) {
  return `${p.x},${p.y}`;
}

function getSk(sk: Uint8Array, w: number, x: number, y: number) {
  return sk[y * w + x] ? 1 : 0;
}

function skNeighbors(p: Point, sk: Uint8Array, w: number, h: number): Point[] {
  const o: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = p.x + dx,
        ny = p.y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && getSk(sk, w, nx, ny)) o.push({ x: nx, y: ny });
    }
  }
  return o;
}

function neighborCount(sk: Uint8Array, w: number, h: number, x: number, y: number): number {
  return skNeighbors({ x, y }, sk, w, h).length;
}

export type SkeletonNodeType = "endpoint" | "junction";

export interface SkGraphNode {
  id: string;
  x: number;
  y: number;
  type: SkeletonNodeType;
}

export interface SkGraphEdge {
  id: string;
  from: string;
  to: string;
  pixels: Point[]; // includes from..to along skeleton
}

export interface SkeletonGraph {
  nodes: SkGraphNode[];
  edges: SkGraphEdge[];
  nodeById: Map<string, SkGraphNode>;
  pixelToNodeId: Map<string, string>;
}

function isGraphPixel(sk: Uint8Array, w: number, h: number, x: number, y: number): boolean {
  if (!getSk(sk, w, x, y)) return false;
  const n = neighborCount(sk, w, h, x, y);
  return n === 1 || n >= 3;
}

export function buildSkeletonGraph(sk: Uint8Array, w: number, h: number): SkeletonGraph {
  const nodes: SkGraphNode[] = [];
  const pixelToNodeId = new Map<string, string>();
  let nid = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!isGraphPixel(sk, w, h, x, y)) continue;
      const t: SkeletonNodeType = neighborCount(sk, w, h, x, y) >= 3 ? "junction" : "endpoint";
      const id = `n${nid++}`;
      nodes.push({ id, x, y, type: t });
      pixelToNodeId.set(key({ x, y }), id);
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: SkGraphEdge[] = [];
  const edgeSeen = new Set<string>();
  let eid = 0;

  function traceEdge(fromNode: SkGraphNode, first: Point): { pixels: Point[]; endId: string } | null {
    const path: Point[] = [{ x: fromNode.x, y: fromNode.y }, first];
    let prev: Point = { x: fromNode.x, y: fromNode.y };
    let cur = first;
    while (true) {
      const neigh = skNeighbors(cur, sk, w, h).filter((p) => !(p.x === prev.x && p.y === prev.y));
      if (neigh.length === 0) {
        const k = key(cur);
        const endId = pixelToNodeId.get(k);
        if (endId) return { pixels: path, endId };
        return { pixels: path, endId: fromNode.id };
      }
      if (neigh.length > 1) {
        const k = key(cur);
        const endId = pixelToNodeId.get(k);
        if (endId) {
          path.push(cur);
          return { pixels: path, endId };
        }
        break;
      }
      const next = neigh[0];
      path.push(next);
      const nk = key(next);
      if (pixelToNodeId.has(nk)) {
        return { pixels: path, endId: pixelToNodeId.get(nk)! };
      }
      prev = cur;
      cur = next;
    }
    return null;
  }

  for (const n of nodes) {
    const neigh = skNeighbors({ x: n.x, y: n.y }, sk, w, h);
    for (const nb of neigh) {
      const nk = key(nb);
      if (pixelToNodeId.has(nk) && pixelToNodeId.get(nk) !== n.id) {
        const other = pixelToNodeId.get(nk)!;
        const ek = [n.id, other].sort().join("|");
        if (edgeSeen.has(ek)) continue;
        edgeSeen.add(ek);
        const pixels = n.x === nb.x && n.y === nb.y ? [n] : [n, nb];
        edges.push({ id: `e${eid++}`, from: n.id, to: other, pixels });
        continue;
      }
      const tr = traceEdge(n, nb);
      if (!tr) continue;
      const ek = [n.id, tr.endId].sort().join("|");
      if (edgeSeen.has(ek)) continue;
      edgeSeen.add(ek);
      edges.push({ id: `e${eid++}`, from: n.id, to: tr.endId, pixels: tr.pixels });
    }
  }

  return { nodes, edges, nodeById, pixelToNodeId };
}

/** Remove short terminal branches (spurs) from the thinned skeleton. */
export function pruneSkeletonSpurs(sk: Uint8Array, w: number, h: number, maxSpurLen: number): Uint8Array {
  const out = new Uint8Array(sk);
  function setSk(x: number, y: number, v: number) {
    out[y * w + x] = v ? 1 : 0;
  }
  for (let iter = 0; iter < 400; iter++) {
    let removed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!getSk(out, w, x, y)) continue;
        if (skNeighbors({ x, y }, out, w, h).length !== 1) continue;
        const chain = traceSpurChain(out, w, h, { x, y });
        if (chain.length === 0 || chain.length > maxSpurLen) continue;
        for (const p of chain) setSk(p.x, p.y, 0);
        removed = true;
      }
    }
    if (!removed) break;
  }
  return out;
}

function enumerateSkeletonComponents(sk: Uint8Array, w: number, h: number): Point[][] {
  const vis = new Uint8Array(w * h);
  const comps: Point[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getSk(sk, w, x, y) || vis[y * w + x]) continue;
      const comp: Point[] = [];
      const q: Point[] = [{ x, y }];
      vis[y * w + x] = 1;
      while (q.length) {
        const p = q.pop()!;
        comp.push(p);
        for (const n of skNeighbors(p, sk, w, h)) {
          const ni = n.y * w + n.x;
          if (!vis[ni]) {
            vis[ni] = 1;
            q.push(n);
          }
        }
      }
      comps.push(comp);
    }
  }
  return comps;
}

/**
 * Like {@link pruneSkeletonSpurs}, but only shortens spurs on the **largest** 8-connected skeleton
 * component. Smaller components (e.g. i/j tittle after thinning) are left unchanged so they are not
 * erased as “short spurs”.
 */
export function pruneSkeletonSpursPreservingMinorComponents(
  sk: Uint8Array,
  w: number,
  h: number,
  maxSpurLen: number
): Uint8Array {
  const comps = enumerateSkeletonComponents(sk, w, h);
  if (comps.length <= 1) return pruneSkeletonSpurs(sk, w, h, maxSpurLen);
  let largestI = 0;
  for (let i = 1; i < comps.length; i++) {
    if (comps[i].length > comps[largestI]!.length) largestI = i;
  }
  const mask = new Uint8Array(w * h);
  for (const p of comps[largestI]!) mask[p.y * w + p.x] = 1;
  const skMain = new Uint8Array(w * h);
  for (let i = 0; i < sk.length; i++) skMain[i] = sk[i] && mask[i] ? 1 : 0;
  const prunedMain = pruneSkeletonSpurs(skMain, w, h, maxSpurLen);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < sk.length; i++) {
    const isMinor = sk[i] && !mask[i];
    out[i] = prunedMain[i] || isMinor ? 1 : 0;
  }
  return out;
}

function traceSpurChain(sk: Uint8Array, w: number, h: number, start: Point): Point[] {
  const path: Point[] = [];
  let prev: Point | null = null;
  let cur: Point = start;
  if (skNeighbors(cur, sk, w, h).length !== 1) return path;
  let steps = 0;
  while (steps++ < 512) {
    const neigh = skNeighbors(cur, sk, w, h).filter((q) => !prev || q.x !== prev.x || q.y !== prev.y);
    if (neigh.length !== 1) break;
    const next = neigh[0]!;
    const nc = skNeighbors(next, sk, w, h).length;
    if (nc >= 3) {
      path.push(cur);
      break;
    }
    path.push(cur);
    if (nc === 1) {
      path.push(next);
      break;
    }
    prev = cur;
    cur = next;
  }
  return path;
}

/** Shortest 8-connected path along skeleton pixels (for merged-graph edges). */
export function shortestSkeletonPath(
  sk: Uint8Array,
  w: number,
  h: number,
  a: Point,
  b: Point
): Point[] | null {
  if (a.x === b.x && a.y === b.y) return [a];
  const ak = key(a);
  const bk = key(b);
  const queue: Point[] = [a];
  const prev = new Map<string, string>();
  const vis = new Set<string>([ak]);
  while (queue.length) {
    const u = queue.shift()!;
    if (u.x === b.x && u.y === b.y) {
      const out: Point[] = [];
      let k: string | null = bk;
      const seen = new Set<string>();
      while (k !== null && !seen.has(k)) {
        seen.add(k);
        const [sx, sy] = k.split(",").map(Number);
        out.push({ x: sx, y: sy });
        if (k === ak) break;
        k = prev.get(k) ?? null;
      }
      return out.reverse();
    }
    const uk = key(u);
    for (const v of skNeighbors(u, sk, w, h)) {
      const vk = key(v);
      if (vis.has(vk)) continue;
      vis.add(vk);
      prev.set(vk, uk);
      queue.push(v);
    }
  }
  return null;
}

export interface SimplifySkeletonGraphOptions {
  /** Merge nodes within this Euclidean distance (px). ~14–18 on a 256 canvas yields ~5–10 nodes. */
  mergeSeparationPx: number;
}

/**
 * Merge nearby topology nodes and rebuild edges along the skeleton (fewer nodes/edges, cleaner graph).
 */
export function simplifySkeletonGraphByProximity(
  graph: SkeletonGraph,
  sk: Uint8Array,
  w: number,
  h: number,
  opts: SimplifySkeletonGraphOptions
): SkeletonGraph {
  const R = opts.mergeSeparationPx;
  const R2 = R * R;
  const nodes = graph.nodes;
  const n = nodes.length;
  if (n === 0) return graph;

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    return parent[i] === i ? i : (parent[i] = find(parent[i]));
  }
  function union(i: number, j: number) {
    const ri = find(i),
      rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i]!,
        b = nodes[j]!;
      const dx = a.x - b.x,
        dy = a.y - b.y;
      if (dx * dx + dy * dy <= R2) union(i, j);
    }
  }

  const clusters = new Map<number, SkGraphNode[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(nodes[i]!);
  }

  const sortedRoots = [...clusters.keys()].sort((a, b) => a - b);
  const newNodesRaw: { id: string; x: number; y: number }[] = [];
  const oldIdToNew = new Map<string, string>();
  let nid = 0;
  for (const root of sortedRoots) {
    const group = clusters.get(root)!;
    let sx = 0,
      sy = 0;
    for (const p of group) {
      sx += p.x;
      sy += p.y;
    }
    const cx = Math.round(sx / group.length);
    const cy = Math.round(sy / group.length);
    const snapped = nearestSkeletonPixel(sk, w, h, cx, cy) ?? { x: cx, y: cy };
    const id = `n${nid++}`;
    newNodesRaw.push({ id, x: snapped.x, y: snapped.y });
    for (const g of group) oldIdToNew.set(g.id, id);
  }

  const edgeSeen = new Set<string>();
  const newEdges: SkGraphEdge[] = [];
  let eid = 0;
  for (const e of graph.edges) {
    const na = oldIdToNew.get(e.from);
    const nb = oldIdToNew.get(e.to);
    if (!na || !nb || na === nb) continue;
    const ek = [na, nb].sort().join("|");
    if (edgeSeen.has(ek)) continue;
    edgeSeen.add(ek);
    const ap = newNodesRaw.find((x) => x.id === na)!;
    const bp = newNodesRaw.find((x) => x.id === nb)!;
    let pixels = shortestSkeletonPath(sk, w, h, ap, bp);
    if (!pixels || pixels.length < 2) {
      pixels = [ap, bp];
    }
    newEdges.push({ id: `e${eid++}`, from: na, to: nb, pixels });
  }

  const deg = new Map<string, number>();
  for (const nr of newNodesRaw) deg.set(nr.id, 0);
  for (const e of newEdges) {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  }
  const newNodes: SkGraphNode[] = newNodesRaw.map((nr) => ({
    ...nr,
    type: (deg.get(nr.id) || 0) <= 1 ? "endpoint" : "junction",
  }));

  const nodeById = new Map(newNodes.map((x) => [x.id, x]));
  const pixelToNodeId = new Map<string, string>();
  for (const nn of newNodes) pixelToNodeId.set(key({ x: nn.x, y: nn.y }), nn.id);

  return { nodes: newNodes, edges: newEdges, nodeById, pixelToNodeId };
}

/** Nearest skeleton pixel to (px,py) */
export function nearestSkeletonPixel(
  sk: Uint8Array,
  w: number,
  h: number,
  px: number,
  py: number
): Point | null {
  let best: Point | null = null;
  let bd = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getSk(sk, w, x, y)) continue;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Squared euclidean distance from (px,py) to nearest skeleton pixel (Infinity if empty). */
export function distanceSqToNearestSkeleton(
  sk: Uint8Array,
  w: number,
  h: number,
  px: number,
  py: number
): number {
  let bd = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getSk(sk, w, x, y)) continue;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < bd) bd = d;
    }
  }
  return bd;
}

/** Nearest point on any edge polyline + hint */
export function nearestEdgeHint(
  graph: SkeletonGraph,
  px: number,
  py: number
): { edge: SkGraphEdge; index: number; dist: number } | null {
  let best: { edge: SkGraphEdge; index: number; dist: number } | null = null;
  for (const e of graph.edges) {
    for (let i = 0; i < e.pixels.length; i++) {
      const p = e.pixels[i];
      const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
      if (!best || d < best.dist) best = { edge: e, index: i, dist: d };
    }
  }
  return best;
}
