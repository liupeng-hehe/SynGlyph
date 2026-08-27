"use client";

import { useEffect, useRef } from "react";

const PALETTE: [number, number, number, number][] = [
  [220, 80, 80, 220],
  [80, 200, 120, 220],
  [100, 140, 255, 220],
  [230, 200, 80, 220],
  [200, 100, 220, 220],
  [90, 210, 210, 220],
  [255, 150, 100, 220],
  [160, 160, 255, 220],
];

function rgba(i: number): [number, number, number, number] {
  return PALETTE[i % PALETTE.length]!;
}

function neigh4(x: number, y: number, w: number, h: number): [number, number][] {
  const o: [number, number][] = [];
  if (x > 0) o.push([x - 1, y]);
  if (x < w - 1) o.push([x + 1, y]);
  if (y > 0) o.push([x, y - 1]);
  if (y < h - 1) o.push([x, y + 1]);
  return o;
}

/** Src-over: blend non-premultiplied (sr,sb,sg) with alpha sa onto existing pixel at j. */
function blendSrcOver(
  data: Uint8ClampedArray,
  j: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number
): void {
  const saN = sa / 255;
  const dr = data[j]!,
    dg = data[j + 1]!,
    db = data[j + 2]!,
    da = data[j + 3]! / 255;
  const inv = 1 - saN;
  const outAN = saN + da * inv;
  if (outAN < 1e-6) {
    data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0;
    return;
  }
  const outPremulR = (sr / 255) * saN + (dr / 255) * da * inv;
  const outPremulG = (sg / 255) * saN + (dg / 255) * da * inv;
  const outPremulB = (sb / 255) * saN + (db / 255) * da * inv;
  data[j] = Math.round((outPremulR / outAN) * 255);
  data[j + 1] = Math.round((outPremulG / outAN) * 255);
  data[j + 2] = Math.round((outPremulB / outAN) * 255);
  data[j + 3] = Math.round(outAN * 255);
}

type Props = {
  width: number;
  height: number;
  label: Int32Array;
  nComp: number;
  /** Normalized offsets (fraction of canvas width / height). */
  offsets: Record<string, { dx: number; dy: number }>;
  explodedView: boolean;
  selectedPieceId: string | null;
};

/**
 * Raster overlay: colored pieces, optionally shifted for exploded view (original mask unchanged).
 */
export function PieceOverlay({
  width: w,
  height: h,
  label,
  nComp,
  offsets,
  explodedView,
  selectedPieceId,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || nComp <= 0) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) data[i + 3] = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const L = label[y * w + x];
        if (L < 0 || L >= nComp) continue;
        const pid = `p${L}`;
        const off = offsets[pid];
        const dx = explodedView && off ? Math.round(off.dx * w) : 0;
        const dy = explodedView && off ? Math.round(off.dy * h) : 0;
        const ox = x + dx;
        const oy = y + dy;
        if (ox < 0 || ox >= w || oy < 0 || oy >= h) continue;
        const j = (oy * w + ox) * 4;
        const [r, g, b, a] = rgba(L);
        data[j] = r;
        data[j + 1] = g;
        data[j + 2] = b;
        data[j + 3] = a;
      }
    }

    if (explodedView) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (label[y * w + x] !== -1) continue;
          const comps = new Set<number>();
          for (const [nx, ny] of neigh4(x, y, w, h)) {
            const L = label[ny * w + nx];
            if (L >= 0 && L < nComp) comps.add(L);
          }
          if (comps.size < 2) continue;
          const list = [...comps].sort((a, b) => a - b);
          const saEach = Math.max(48, Math.floor(200 / list.length));
          for (const comp of list) {
            const pid = `p${comp}`;
            const off = offsets[pid];
            const dx = off ? Math.round(off.dx * w) : 0;
            const dy = off ? Math.round(off.dy * h) : 0;
            const ox = x + dx;
            const oy = y + dy;
            if (ox < 0 || ox >= w || oy < 0 || oy >= h) continue;
            const j = (oy * w + ox) * 4;
            const [r, g, b] = rgba(comp);
            blendSrcOver(data, j, r, g, b, saEach);
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);

    if (selectedPieceId) {
      const m = /^p(\d+)$/.exec(selectedPieceId);
      if (m) {
        const si = Number(m[1]);
        const off = offsets[selectedPieceId];
        const dx = explodedView && off ? Math.round(off.dx * w) : 0;
        const dy = explodedView && off ? Math.round(off.dy * h) : 0;
        let minX = w,
          minY = h,
          maxX = 0,
          maxY = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (label[y * w + x] !== si) continue;
            const px = x + dx,
              py = y + dy;
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
        }
        if (minX <= maxX) {
          ctx.strokeStyle = "rgba(55, 60, 68, 0.92)";
          ctx.lineWidth = 2.25;
          ctx.strokeRect(minX + 0.5, minY + 0.5, maxX - minX, maxY - minY);
        }
      }
    }
  }, [w, h, label, nComp, offsets, explodedView, selectedPieceId]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className="pointer-events-none block h-full max-h-full w-full object-contain"
    />
  );
}
