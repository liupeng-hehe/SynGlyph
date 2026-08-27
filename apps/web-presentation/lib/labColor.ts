/** sRGB ↔ LAB (D65), aligned with apps/api/app/utils/color.py */

function linearize(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function delinearize(c: number): number {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * c ** (1 / 2.4) - 0.055;
}

export function hexToLab(hex: string): { L: number; a: number; b: number } {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) throw new Error("Hex must be 6 chars");
  let r = parseInt(h.slice(0, 2), 16) / 255;
  let g = parseInt(h.slice(2, 4), 16) / 255;
  let b = parseInt(h.slice(4, 6), 16) / 255;
  r = linearize(r);
  g = linearize(g);
  b = linearize(b);
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  x /= xn;
  y /= yn;
  z /= zn;
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const fy = f(y);
  const L = 116 * fy - 16;
  const a = 500 * (f(x) - fy);
  const bLab = 200 * (fy - f(z));
  return { L, a, b: bLab };
}

export function labToHex(L: number, a: number, b: number): string {
  const yn = 1.0;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const invF = (t: number) => (t > 0.20689655172413793 ? t ** 3 : (t - 16 / 116) / 7.787);
  const xn = 0.95047;
  const zn = 1.08883;
  let x = xn * invF(fx);
  let y = yn * invF(fy);
  let z = zn * invF(fz);
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  r = Math.max(0, Math.min(1, delinearize(r)));
  g = Math.max(0, Math.min(1, delinearize(g)));
  bl = Math.max(0, Math.min(1, delinearize(bl)));
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(bl * 255);
  return `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`;
}

export function clampLab(L: number, a: number, b: number): { L: number; a: number; b: number } {
  return {
    L: Math.max(0, Math.min(100, L)),
    a: Math.max(-128, Math.min(127, a)),
    b: Math.max(-128, Math.min(127, b)),
  };
}
