import { hexToLab, labToHex } from "@synglyph/shared";

import namedColorsData from "@/data/namedColors.json";

export function normalizeHex(input: string): string {
  let h = input.trim().replace(/^#/, "").toUpperCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9A-F]{6}$/.test(h)) throw new Error("Invalid hex");
  return `#${h}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function labTupleFromHex(hex: string): [number, number, number] {
  const clean = normalizeHex(hex).replace("#", "");
  return hexToLab(clean);
}

export function labObjectFromHex(hex: string): { l: number; a: number; b: number } {
  const [l, a, b] = labTupleFromHex(hex);
  return { l, a, b };
}

/** LAB object to hex with # */
export function hexFromLab(l: number, a: number, b: number): string {
  const raw = labToHex(l, a, b);
  return `#${raw}`.toUpperCase();
}
