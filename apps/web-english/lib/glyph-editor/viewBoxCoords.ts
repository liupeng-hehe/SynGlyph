/**
 * Map click coordinates to viewBox pixel space when the graphic is scaled with
 * preserveAspectRatio xMidYMid meet (same as SVG default for our editor).
 */
export function clientToViewBoxPixel(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  vbW: number,
  vbH: number
): { px: number; py: number; insideViewBox: boolean } {
  const mx = clientX - containerRect.left;
  const my = clientY - containerRect.top;
  const rw = containerRect.width;
  const rh = containerRect.height;
  if (rw <= 0 || rh <= 0 || vbW <= 0 || vbH <= 0) {
    return { px: 0, py: 0, insideViewBox: false };
  }
  const scale = Math.min(rw / vbW, rh / vbH);
  const ox = (rw - scale * vbW) / 2;
  const oy = (rh - scale * vbH) / 2;
  const vx = (mx - ox) / scale;
  const vy = (my - oy) / scale;
  const insideViewBox = vx >= 0 && vx < vbW && vy >= 0 && vy < vbH;
  const px = Math.max(0, Math.min(vbW - 1, Math.floor(vx)));
  const py = Math.max(0, Math.min(vbH - 1, Math.floor(vy)));
  return { px, py, insideViewBox };
}

/** Unclamped viewBox coords (float) for smooth drag deltas even when pointer leaves the box slightly. */
export function clientToViewBoxFloat(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  vbW: number,
  vbH: number
): { fx: number; fy: number; insideViewBox: boolean } {
  const mx = clientX - containerRect.left;
  const my = clientY - containerRect.top;
  const rw = containerRect.width;
  const rh = containerRect.height;
  if (rw <= 0 || rh <= 0 || vbW <= 0 || vbH <= 0) {
    return { fx: 0, fy: 0, insideViewBox: false };
  }
  const scale = Math.min(rw / vbW, rh / vbH);
  const ox = (rw - scale * vbW) / 2;
  const oy = (rh - scale * vbH) / 2;
  const fx = (mx - ox) / scale;
  const fy = (my - oy) / scale;
  const insideViewBox = fx >= 0 && fx < vbW && fy >= 0 && fy < vbH;
  return { fx, fy, insideViewBox };
}
