import type { PassageGlyph } from "./passageRender";

export type StripeBand = {
  hex: string;
  /** 0–1 relative width in one repeat cycle */
  weight: number;
  /** 0–1 overlay strength */
  opacity: number;
};

export type PassageStripeSpec = {
  angleDeg: number;
  bands: StripeBand[];
  /** CSS repeat period in px */
  periodPx: number;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Stripes from letter hues appearing in the passage (deterministic, text-aligned). */
export function stripesFromPassageGlyphs(
  glyphs: PassageGlyph[],
  backgroundHex: string,
): PassageStripeSpec {
  const seen = new Set<string>();
  const bands: StripeBand[] = [];
  for (const g of glyphs) {
    if (!/[a-zA-Z]/.test(g.text)) continue;
    const key = g.hex.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bands.push({
      hex: g.hex,
      weight: 1,
      opacity: 0.07 + clamp01(g.prominence) * 0.06,
    });
    if (bands.length >= 7) break;
  }
  if (bands.length < 2) {
    bands.push({ hex: backgroundHex, weight: 1, opacity: 0.04 });
  }
  return {
    angleDeg: -18,
    bands,
    periodPx: 56,
  };
}

export function cssStripeGradient(spec: PassageStripeSpec): string {
  const total = spec.bands.reduce((a, b) => a + b.weight, 0) || 1;
  let pos = 0;
  const stops: string[] = [];
  for (const band of spec.bands) {
    const start = (pos / total) * 100;
    pos += band.weight;
    const end = (pos / total) * 100;
    const a = clamp01(band.opacity);
    const h = band.hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    stops.push(`rgba(${r},${g},${b},${a}) ${start.toFixed(2)}%`);
    stops.push(`rgba(${r},${g},${b},${a}) ${end.toFixed(2)}%`);
  }
  return `repeating-linear-gradient(${spec.angleDeg}deg, ${stops.join(", ")})`;
}

/** Normalize optional LLM stripe payload. */
export function parseLlmStripeSpec(raw: unknown): PassageStripeSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const angleDeg = typeof o.angleDeg === "number" ? o.angleDeg : -22;
  const periodPx = typeof o.periodPx === "number" ? o.periodPx : 64;
  const bandsRaw = o.bands;
  if (!Array.isArray(bandsRaw) || bandsRaw.length < 2) return null;
  const bands: StripeBand[] = [];
  for (const row of bandsRaw) {
    if (!row || typeof row !== "object") continue;
    const b = row as Record<string, unknown>;
    if (typeof b.hex !== "string") continue;
    bands.push({
      hex: b.hex,
      weight: typeof b.weight === "number" ? Math.max(0.2, b.weight) : 1,
      opacity: typeof b.opacity === "number" ? clamp01(b.opacity) : 0.12,
    });
  }
  if (bands.length < 2) return null;
  return { angleDeg, bands, periodPx };
}
