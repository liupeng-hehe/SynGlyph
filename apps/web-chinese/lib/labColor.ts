/** Simple LAB→sRGB for canvas preview (D65, 2°). */

export function labToRgb(l: number, a: number, b: number): [number, number, number] {
  const y = (l + 16) / 116;
  const x = a / 500 + y;
  const z = y - b / 200;
  const x3 = x * x * x;
  const y3 = y * y * y;
  const z3 = z * z * z;
  const xr = (x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787) * 0.95047;
  const yr = y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787;
  const zr = (z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787) * 1.08883;
  let R = xr * 3.2406 + yr * -1.5372 + zr * -0.4986;
  let G = xr * -0.9689 + yr * 1.8758 + zr * 0.0415;
  let B = xr * 0.0557 + yr * -0.204 + zr * 1.057;
  const lin = (u: number) => (u > 0.0031308 ? 1.055 * u ** (1 / 2.4) - 0.055 : 12.92 * u);
  R = lin(R);
  G = lin(G);
  B = lin(B);
  return [
    Math.max(0, Math.min(255, Math.round(R * 255))),
    Math.max(0, Math.min(255, Math.round(G * 255))),
    Math.max(0, Math.min(255, Math.round(B * 255))),
  ];
}

export function labColorFromJson(colorJson: { space?: string; value?: number[] } | null | undefined): [number, number, number] {
  const v = colorJson?.value;
  if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "number") {
    return labToRgb(v[0], v[1], v[2]);
  }
  return [180, 180, 200];
}
