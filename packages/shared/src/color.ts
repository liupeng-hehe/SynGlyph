/**
 * Hex and LAB color conversions. Uses sRGB -> XYZ -> LAB.
 */

function linearize(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function delinearize(c: number): number {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Convert 6-char hex (with or without #) to LAB [L, a, b]. */
export function hexToLab(hexColor: string): [number, number, number] {
  const h = hexColor.replace("#", "").trim();
  if (h.length !== 6) throw new Error("Hex must be 6 chars");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const [rL, gL, bL] = [linearize(r), linearize(g), linearize(b)];
  const x = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
  const y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.072175;
  const z = rL * 0.0193339 + gL * 0.119192 + bL * 0.950304;
  const [xn, yn, zn] = [0.95047, 1, 1.08883];
  const xr = x / xn;
  const yr = y / yn;
  const zr = z / zn;
  const f = (t: number) => (t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + 16 / 116);
  const fy = f(yr);
  const L = 116 * fy - 16;
  const a = 500 * (f(xr) - fy);
  const bVal = 200 * (fy - f(zr));
  return [L, a, bVal];
}

/** Convert LAB to 6-char hex (no #). */
export function labToHex(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const invF = (t: number) =>
    t > 6 / 29 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787;
  const [xn, yn, zn] = [0.95047, 1, 1.08883];
  const x = xn * invF(fx);
  const y = yn * invF(fy);
  const z = zn * invF(fz);
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  r = Math.max(0, Math.min(1, delinearize(r)));
  g = Math.max(0, Math.min(1, delinearize(g)));
  bl = Math.max(0, Math.min(1, delinearize(bl)));
  return [r, g, bl]
    .map((n) => Math.round(n * 255).toString(16).padStart(2, "0"))
    .join("");
}
