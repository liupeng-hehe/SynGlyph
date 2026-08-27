/** Single-letter raster for glyph-graph lab (must match preprocess + skeleton). */

export const GLYPH_GRAPH_CANVAS = 256;

/** Geometric sans; avoids serif spurs that explode skeleton node counts vs Futura-like shapes. */
const GLYPH_GRAPH_FONT_FAMILY =
  'Futura, "Futura PT", "Century Gothic", system-ui, sans-serif';

export function renderLetterToImageData(letter: string): ImageData {
  const CANVAS = GLYPH_GRAPH_CANVAS;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS, CANVAS);
  ctx.fillStyle = "#000000";
  ctx.font = `${Math.floor(CANVAS * 0.62)}px ${GLYPH_GRAPH_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, CANVAS / 2, (CANVAS / 2) * 1.02);
  return ctx.getImageData(0, 0, CANVAS, CANVAS);
}
