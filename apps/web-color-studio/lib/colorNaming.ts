import namedColorsData from "@/data/namedColors.json";

import { labTupleFromHex } from "./colorAdapter";

type NamedRow = { name: string; hex: string };

export type NamedColorEntry = NamedRow & { lab: [number, number, number] };

const PALETTE: NamedColorEntry[] = (namedColorsData as NamedRow[]).map((row) => ({
  ...row,
  lab: labTupleFromHex(`#${row.hex.replace(/^#/, "")}`),
}));

/** CIE76 Delta E in LAB space */
export function deltaE(
  lab1: [number, number, number],
  lab2: [number, number, number],
): number {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export function nearestNamedColor(hex: string): { suggestedName: string; deltaE: number } {
  const target = labTupleFromHex(hex);
  let bestName = PALETTE[0]!.name;
  let bestD = Infinity;
  for (const row of PALETTE) {
    const d = deltaE(target, row.lab);
    if (d < bestD) {
      bestD = d;
      bestName = row.name;
    }
  }
  return { suggestedName: bestName, deltaE: bestD };
}

export async function fetchTheColorApiName(hex: string): Promise<string | null> {
  const clean = hex.replace(/^#/, "").toUpperCase();
  try {
    const res = await fetch(`https://www.thecolorapi.com/id?hex=${clean}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: { value?: string } };
    const v = data.name?.value;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
