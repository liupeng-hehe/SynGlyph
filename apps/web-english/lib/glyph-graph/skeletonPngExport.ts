/**
 * Rasterize GlyphGraphExportV1 skeletons to PNG for
 * research/glyph_shape_family/scripts/extract_features.py (black bg, bright strokes).
 */
import type { GlyphGraphExportV1 } from "@/lib/glyph-editor/primitiveGraph";

import { GLYPH_GRAPH_CANVAS } from "@/lib/glyph-graph/renderLetterCanvas";

export function getSkeletonCanvasDims(exp: GlyphGraphExportV1): { w: number; h: number } {
  const w = exp.image?.width ?? GLYPH_GRAPH_CANVAS;
  const h = exp.image?.height ?? GLYPH_GRAPH_CANVAS;
  return { w, h };
}

/** Skeleton from stored topology: edge pixel paths + node positions. */
export function buildSkeletonRasterFromGlyphExport(exp: GlyphGraphExportV1, w: number, h: number): Uint8Array {
  const sk = new Uint8Array(w * h);
  for (const e of exp.skeletonTopology?.edges ?? []) {
    for (const p of e.pixels) {
      const x = Math.max(0, Math.min(w - 1, Math.round(p.x)));
      const y = Math.max(0, Math.min(h - 1, Math.round(p.y)));
      sk[y * w + x] = 1;
    }
  }
  for (const n of exp.skeletonTopology?.nodes ?? []) {
    const x = Math.max(0, Math.min(w - 1, Math.round(n.x)));
    const y = Math.max(0, Math.min(h - 1, Math.round(n.y)));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) sk[ny * w + nx] = 1;
      }
    }
  }
  return sk;
}

/** Black background, white skeleton — matches extract_features load_skeleton_mask. */
export function skeletonRasterToPngBlob(sk: Uint8Array, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2d context"));
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = sk[i] ? 255 : 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("PNG encode failed"));
      },
      "image/png",
      1
    );
  });
}

export async function glyphExportToSkeletonPngBlob(exp: GlyphGraphExportV1): Promise<Blob> {
  const { w, h } = getSkeletonCanvasDims(exp);
  const sk = buildSkeletonRasterFromGlyphExport(exp, w, h);
  return skeletonRasterToPngBlob(sk, w, h);
}
