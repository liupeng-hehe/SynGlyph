/**
 * CIE Lab → sRGB (D65), aligned with `apps/api/app/util/lab_color.py` / web preview.
 * Returns linear [0,1] channels for three.js Color.
 */
export function labToSrgb(l: number, a: number, b: number): [number, number, number] {
  const y = (l + 16) / 116;
  const x = a / 500 + y;
  const z = y - b / 200;
  const x3 = x * x * x;
  const y3 = y * y * y;
  const z3 = z * z * z;
  const xr =
    (x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787) * 0.95047;
  const yr = y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787;
  const zr =
    (z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787) * 1.08883;
  let rLin = xr * 3.2406 + yr * -1.5372 + zr * -0.4986;
  let gLin = xr * -0.9689 + yr * 1.8758 + zr * 0.0415;
  let bLin = xr * 0.0557 + yr * -0.204 + zr * 1.057;

  const lin = (u: number) =>
    u > 0.0031308 ? 1.055 * u ** (1 / 2.4) - 0.055 : 12.92 * u;

  const r = lin(rLin);
  const g = lin(gLin);
  const bl = lin(bLin);
  return [
    clamp01(r),
    clamp01(g),
    clamp01(bl),
  ];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
