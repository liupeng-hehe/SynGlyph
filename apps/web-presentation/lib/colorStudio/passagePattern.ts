/** Single-hue grid / dot patterns for invitation-style passage cards. */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").padStart(6, "0").slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ink for pattern lines — same family as wash, slightly shifted for contrast. */
export function patternInkRgba(backgroundHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(backgroundHex);
  const lum = relLuminance(backgroundHex);
  const mix = lum > 0.72 ? 0.35 : -0.25;
  const nr = Math.max(0, Math.min(255, Math.round(r + (0 - r) * mix + (lum > 0.72 ? -40 : 30))));
  const ng = Math.max(0, Math.min(255, Math.round(g + (47 - g) * mix * 0.3)));
  const nb = Math.max(0, Math.min(255, Math.round(b + (167 - b) * mix * 0.45)));
  return `rgba(${nr},${ng},${nb},${alpha})`;
}

export type PatternKind = "grid" | "dots";

export function invitationPatternCss(
  backgroundHex: string,
  kind: PatternKind = "grid",
): { backgroundImage: string; backgroundSize: string; backgroundPosition?: string } {
  const line = patternInkRgba(backgroundHex, kind === "grid" ? 0.14 : 0.14);

  if (kind === "dots") {
    return {
      backgroundImage: `radial-gradient(circle, ${line} 1px, transparent 1px)`,
      backgroundSize: "18px 18px",
      backgroundPosition: "0 0",
    };
  }

  /** Uniform graph-paper grid — small squares, full bleed when tiled on container. */
  return {
    backgroundImage: `
      linear-gradient(${line} 1px, transparent 1px),
      linear-gradient(90deg, ${line} 1px, transparent 1px)
    `.trim(),
    backgroundSize: "18px 18px",
    backgroundPosition: "0 0",
  };
}
