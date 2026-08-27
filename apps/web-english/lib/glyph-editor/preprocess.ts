/**
 * Grayscale → binary → skeleton → contours → keypoints.
 * Pure TS for browser; Python mirror uses skimage.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PreprocessResult {
  width: number;
  height: number;
  binary: Uint8Array; // row-major 0/1
  skeleton: Uint8Array;
  contours: Point[][];
  keypoints: {
    endpoints: Point[];
    junctions: Point[];
    curvature_peaks: Point[];
    anchors: Point[];
  };
}

function getU8(bin: Uint8Array, w: number, x: number, y: number): number {
  return bin[y * w + x] ? 1 : 0;
}

function setU8(bin: Uint8Array, w: number, x: number, y: number, v: number) {
  bin[y * w + x] = v ? 1 : 0;
}

/** Otsu threshold on grayscale ImageData (RGBA) */
export function binarizeFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[g]++;
  }
  let total = width * height;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between >= maxVar) {
      maxVar = between;
      thresh = t;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      setU8(out, width, x, y, g < thresh ? 1 : 0);
    }
  }
  return out;
}

/** Assume glyph is dark on light: invert if ink is minority */
export function ensureInkForeground(binary: Uint8Array, w: number, h: number): Uint8Array {
  let s = 0;
  for (let i = 0; i < binary.length; i++) s += binary[i];
  const inkRatio = s / binary.length;
  if (inkRatio > 0.5) {
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary[i] ? 0 : 1;
    return out;
  }
  return binary.slice();
}

function neighbors8(x: number, y: number, w: number, h: number): Point[] {
  const o: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) o.push({ x: nx, y: ny });
    }
  }
  return o;
}

function countNeighbors8(bin: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (!getU8(bin, w, x, y)) return 0;
  let c = 0;
  for (const p of neighbors8(x, y, w, h)) {
    if (getU8(bin, w, p.x, p.y)) c++;
  }
  return c;
}

/** Zhang-Suen thinning; input/output: row-major 0/1, 1 = foreground */
export function zhangSuenThinning(binary: Uint8Array, w: number, h: number): Uint8Array {
  const sk = new Uint8Array(binary);
  let changed = true;
  while (changed) {
    changed = false;
    const toRemove: Point[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!getU8(sk, w, x, y)) continue;
        const p = [
          getU8(sk, w, x, y + 1),
          getU8(sk, w, x - 1, y + 1),
          getU8(sk, w, x - 1, y),
          getU8(sk, w, x - 1, y - 1),
          getU8(sk, w, x, y - 1),
          getU8(sk, w, x + 1, y - 1),
          getU8(sk, w, x + 1, y),
          getU8(sk, w, x + 1, y + 1),
        ];
        const B = p.reduce((a, b) => a + b, 0);
        if (B < 2 || B > 6) continue;
        const a =
          (p[0] === 0 && p[1] === 1 ? 1 : 0) +
          (p[1] === 0 && p[2] === 1 ? 1 : 0) +
          (p[2] === 0 && p[3] === 1 ? 1 : 0) +
          (p[3] === 0 && p[4] === 1 ? 1 : 0) +
          (p[4] === 0 && p[5] === 1 ? 1 : 0) +
          (p[5] === 0 && p[6] === 1 ? 1 : 0) +
          (p[6] === 0 && p[7] === 1 ? 1 : 0) +
          (p[7] === 0 && p[0] === 1 ? 1 : 0);
        if (a !== 1) continue;
        if (p[0] * p[2] * p[4] !== 0) continue;
        if (p[2] * p[4] * p[6] !== 0) continue;
        toRemove.push({ x, y });
      }
    }
    for (const { x, y } of toRemove) {
      setU8(sk, w, x, y, 0);
      changed = true;
    }
    toRemove.length = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!getU8(sk, w, x, y)) continue;
        const p = [
          getU8(sk, w, x, y + 1),
          getU8(sk, w, x - 1, y + 1),
          getU8(sk, w, x - 1, y),
          getU8(sk, w, x - 1, y - 1),
          getU8(sk, w, x, y - 1),
          getU8(sk, w, x + 1, y - 1),
          getU8(sk, w, x + 1, y),
          getU8(sk, w, x + 1, y + 1),
        ];
        const B = p.reduce((a, b) => a + b, 0);
        if (B < 2 || B > 6) continue;
        const a =
          (p[0] === 0 && p[1] === 1 ? 1 : 0) +
          (p[1] === 0 && p[2] === 1 ? 1 : 0) +
          (p[2] === 0 && p[3] === 1 ? 1 : 0) +
          (p[3] === 0 && p[4] === 1 ? 1 : 0) +
          (p[4] === 0 && p[5] === 1 ? 1 : 0) +
          (p[5] === 0 && p[6] === 1 ? 1 : 0) +
          (p[6] === 0 && p[7] === 1 ? 1 : 0) +
          (p[7] === 0 && p[0] === 1 ? 1 : 0);
        if (a !== 1) continue;
        if (p[0] * p[2] * p[6] !== 0) continue;
        if (p[0] * p[4] * p[6] !== 0) continue;
        toRemove.push({ x, y });
      }
    }
    for (const { x, y } of toRemove) {
      setU8(sk, w, x, y, 0);
      changed = true;
    }
  }
  return sk;
}

/**
 * Zhang–Suen can erase very small blobs entirely. For each 8-connected binary component, if no
 * skeleton pixel remains inside it, place one skeleton pixel at the pixel nearest the component
 * centroid (so i/j tittles still appear in the skeleton layer).
 */
function ensureSkeletonTouchesEachBinaryComponent(
  binary: Uint8Array,
  sk: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  const vis = new Uint8Array(w * h);
  const out = new Uint8Array(sk);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binary[idx] || vis[idx]) continue;
      const comp: Point[] = [];
      const q: Point[] = [{ x, y }];
      vis[y * w + x] = 1;
      while (q.length) {
        const p = q.pop()!;
        comp.push(p);
        for (const n of neighbors8(p.x, p.y, w, h)) {
          const ni = n.y * w + n.x;
          if (binary[ni] && !vis[ni]) {
            vis[ni] = 1;
            q.push(n);
          }
        }
      }
      let skCount = 0;
      let sx = 0,
        sy = 0;
      for (const p of comp) {
        if (getU8(out, w, p.x, p.y)) skCount++;
        sx += p.x;
        sy += p.y;
      }
      if (skCount === 0 && comp.length > 0) {
        let cx = Math.round(sx / comp.length);
        let cy = Math.round(sy / comp.length);
        cx = Math.max(0, Math.min(w - 1, cx));
        cy = Math.max(0, Math.min(h - 1, cy));
        let best = comp[0]!;
        let bestD = 1e9;
        for (const p of comp) {
          const d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        setU8(out, w, best.x, best.y, 1);
      }
    }
  }
  return out;
}

export function largestComponent(binary: Uint8Array, w: number, h: number): Uint8Array {
  const vis = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  let best: Point[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binary[idx] || vis[idx]) continue;
      const comp: Point[] = [];
      const q: Point[] = [{ x, y }];
      vis[y * w + x] = 1;
      while (q.length) {
        const p = q.pop()!;
        comp.push(p);
        for (const n of neighbors8(p.x, p.y, w, h)) {
          const ni = n.y * w + n.x;
          if (binary[ni] && !vis[ni]) {
            vis[ni] = 1;
            q.push(n);
          }
        }
      }
      if (comp.length > best.length) best = comp;
    }
  }
  for (const p of best) out[p.y * w + p.x] = 1;
  return out;
}

/**
 * Keep the largest foreground component plus any other component with at least `minSecondaryPixels`
 * pixels. Needed for **i**, **j**, **!**-style glyphs where the tittle is disconnected from the stem;
 * {@link largestComponent} alone drops the dot in binary/skeleton.
 */
export function largestAndSignificantComponents(
  binary: Uint8Array,
  w: number,
  h: number,
  minSecondaryPixels: number
): Uint8Array {
  const vis = new Uint8Array(w * h);
  const comps: Point[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binary[idx] || vis[idx]) continue;
      const comp: Point[] = [];
      const q: Point[] = [{ x, y }];
      vis[y * w + x] = 1;
      while (q.length) {
        const p = q.pop()!;
        comp.push(p);
        for (const n of neighbors8(p.x, p.y, w, h)) {
          const ni = n.y * w + n.x;
          if (binary[ni] && !vis[ni]) {
            vis[ni] = 1;
            q.push(n);
          }
        }
      }
      comps.push(comp);
    }
  }
  let maxLen = 0;
  for (const c of comps) maxLen = Math.max(maxLen, c.length);
  const out = new Uint8Array(w * h);
  for (const c of comps) {
    if (c.length === maxLen || c.length >= minSecondaryPixels) {
      for (const p of c) out[p.y * w + p.x] = 1;
    }
  }
  return out;
}

function traceOuterContour(binary: Uint8Array, w: number, h: number): Point[] {
  let sx = -1,
    sy = -1;
  for (let y = 0; y < h && sx < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (getU8(binary, w, x, y)) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];
  const contour: Point[] = [];
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
  ];
  let cx = sx,
    cy = sy;
  let dir = 0;
  do {
    contour.push({ x: cx, y: cy });
    let found = false;
    for (let t = 0; t < 8; t++) {
      const d = (dir + t + 5) % 8;
      const nx = cx + dirs[d].dx;
      const ny = cy + dirs[d].dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && getU8(binary, w, nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
  } while (cx !== sx || cy !== sy || contour.length < 3);
  return contour;
}

function skeletonKeypoints(sk: Uint8Array, w: number, h: number) {
  const endpoints: Point[] = [];
  const junctions: Point[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!getU8(sk, w, x, y)) continue;
      const n = countNeighbors8(sk, w, h, x, y);
      if (n === 1) endpoints.push({ x, y });
      else if (n >= 3) junctions.push({ x, y });
    }
  }
  const curvature_peaks: Point[] = [];
  const anchors: Point[] = [];
  return { endpoints, junctions, curvature_peaks, anchors };
}

/**
 * 用与 runPreprocess 相同的方式得到前景，求外接矩形中心，把整幅 RGBA 平移使该中心落在画布几何中心
 * （像素中心 w/2、h/2，与田字格 ReferenceGrid 一致）。
 *
 * 对齐用**全部前景**（不取最大连通域）：像 i、j 的点与竖笔往往不连通，若只按最大块算中心，
 * 会把竖笔对准中线而点偏在一边，视觉上像「没对准田字格」。
 */
export function centerGlyphRasterInImageData(imageData: ImageData): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  let binary = binarizeFromImageData(src, w, h);
  binary = ensureInkForeground(binary, w, h);

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const clone = () => new ImageData(new Uint8ClampedArray(src), w, h);

  if (minX > maxX) return clone();

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = Math.round(w / 2 - cx);
  const dy = Math.round(h / 2 - cy);
  if (dx === 0 && dy === 0) return clone();

  const out = new Uint8ClampedArray(w * h * 4);
  out.fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const si = (sy * w + sx) * 4;
        const di = (y * w + x) * 4;
        out[di] = src[si]!;
        out[di + 1] = src[si + 1]!;
        out[di + 2] = src[si + 2]!;
        out[di + 3] = src[si + 3]!;
      }
    }
  }
  return new ImageData(out, w, h);
}

export function runPreprocess(
  imageData: ImageData,
  options?: {
    /** @default true — drop tiny specks but keep i/j tittle-sized blobs */
    useLargestComponent?: boolean;
    /**
     * With default filtering: keep the largest component and any other 8-connected blob with at least
     * this many pixels (so disconnected dots on i/j survive). Ignored if `useLargestComponent` is false.
     * @default 8
     */
    minSecondaryForegroundPixels?: number;
  }
): PreprocessResult {
  const { width: w, height: h, data } = imageData;
  let binary = binarizeFromImageData(data, w, h);
  binary = ensureInkForeground(binary, w, h);
  if (options?.useLargestComponent !== false) {
    const minSec = options?.minSecondaryForegroundPixels ?? 8;
    binary = largestAndSignificantComponents(binary, w, h, minSec);
  }
  let skeleton = zhangSuenThinning(binary, w, h);
  skeleton = ensureSkeletonTouchesEachBinaryComponent(binary, skeleton, w, h);
  const contours = [traceOuterContour(binary, w, h)];
  const keypoints = skeletonKeypoints(skeleton, w, h);
  return {
    width: w,
    height: h,
    binary,
    skeleton,
    contours,
    keypoints,
  };
}

export function normPoint(p: Point, w: number, h: number): [number, number] {
  return [w <= 1 ? 0 : p.x / (w - 1), h <= 1 ? 0 : p.y / (h - 1)];
}
