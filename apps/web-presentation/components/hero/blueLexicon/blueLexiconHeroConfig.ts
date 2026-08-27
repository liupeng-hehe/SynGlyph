/**
 * Tunables — Blue Lexicon hero
 *
 * - `fluidField.*` — luminous lower-half water (baseGradient, blobs, motionSpeed, cyanGlowIntensity, turbulence*)
 * - `page.lowerBackground` — fallback if `fluidField.enabled` is false
 * - `diskSize` / `svg.radii` / `ringText.outer|middle|inner` — disk & type scale
 * - `ringColors.kleinBlue` — surface ring (uniform); underwater = arc palette + clip
 * - `underwaterLetterCycle` — palette, arc bias, drift, submerged opacity
 */

export const blueLexiconHeroConfig = {
  title: "When Words Turn Blue",
  subtitle:
    "Not all words remain black and white; some carry color before they are understood.",

  layout: {
    waterlineYPercent: 50,
    diskCenterOffsetPx: 0,
  },

  page: {
    upperBackground: "#faf9f7",
    /** Fallback when `fluidField.enabled` is false */
    lowerBackground:
      "linear-gradient(180deg, #072A67 0%, #031B4E 48%, #021238 100%)",
    waterlineHighlightOpacity: 0.22,
  },

  /**
   * Luminous animated lower-half field (layered blues + slow motion + light noise).
   * Tweaks: motionSpeed, cyanGlowIntensity, blob colors, turbulence*, baseGradient.
   */
  fluidField: {
    enabled: true,
    /** >1 = faster organic motion (default tuned so liquid reads on real displays). */
    motionSpeed: 1.35,
    /** 0..1 — scales cyan/aqua highlights, caustic, vortex, turbulence */
    cyanGlowIntensity: 0.62,
    baseGradient:
      "linear-gradient(180deg, #0c3480 0%, #082a6e 28%, #051d4d 58%, #04122f 100%)",
    blobBlurPx: 56,
    blob1: {
      background:
        "radial-gradient(ellipse 75% 65% at 38% 32%, rgba(0, 220, 255, 0.42) 0%, rgba(40, 120, 220, 0.12) 42%, transparent 68%)",
      widthPct: "122%",
      heightPct: "92%",
      left: "-28%",
      top: "-18%",
    },
    blob2: {
      background:
        "radial-gradient(ellipse 70% 80% at 72% 68%, rgba(65, 140, 255, 0.35) 0%, rgba(25, 80, 180, 0.14) 48%, transparent 70%)",
      widthPct: "100%",
      heightPct: "115%",
      right: "-32%",
      bottom: "-28%",
    },
    blob3: {
      background:
        "radial-gradient(ellipse 55% 50% at 48% 88%, rgba(120, 235, 255, 0.28) 0%, rgba(30, 100, 200, 0.1) 55%, transparent 72%)",
      widthPct: "88%",
      heightPct: "78%",
      left: "6%",
      bottom: "-12%",
    },
    blob4: {
      background:
        "radial-gradient(circle at 50% 50%, rgba(180, 240, 255, 0.22) 0%, rgba(50, 110, 200, 0.08) 50%, transparent 72%)",
      widthPct: "62%",
      heightPct: "58%",
      left: "36%",
      top: "22%",
    },
    turbulenceOpacity: 0.22,
    turbulenceBlurStd: 1.1,
    turbulenceBaseFrequency: "0.007 0.011",
    turbulenceBaseFrequencyAlt: "0.009 0.014",
  },

  ringColors: {
    kleinBlue: "#002FA7",
    kleinBlueHover: "#0A40C9",
  },

  /** Surface IKB strength + Tailwind size classes for ring copy */
  ringText: {
    surfaceOpacity: 1,
    outer: "text-[14px] md:text-[16px]",
    middle: "text-[12px] md:text-[14px]",
    inner: "text-[10px] md:text-[12px]",
  },

  /**
   * Below waterline: multicolor by **arc position** along the ring (not by which word/letter).
   * Klein vs chroma is decided only by the fixed horizontal clip vs rotation.
   */
  underwaterLetterCycle: {
    palette: [
      "#00C2FF",
      "#2F5BFF",
      "#7A5CFF",
      "#C05CFF",
      "#FF6BD6",
      "#FFD166",
      "#7EE6D8",
    ],
    /** 0..1: shifts hue bands around the ring per radius (not token-specific). */
    ringArcBias: {
      outer: 0,
      middle: 0.09,
      inner: 0.18,
    },
    submergedTextOpacity: 0.88,
    /**
     * If true, whitespace does not advance the palette (uses previous color’s mute).
     * If false, every code unit (incl. spaces, ·) advances the cycle.
     */
    skipWhitespace: false,
    /**
     * Underwater palette phase advances by 1 on this interval (ms), all rings together.
     * 0 = no time drift (only spatial clip + arc palette). Respects reduced motion in client.
     */
    paletteDriftIntervalMs: 3200,
  },

  ripples: {
    enabled: true,
    maxConcurrent: 14,
    spawnIntervalMs: 85,
    startDiameterPx: 8,
    endDiameterPx: 128,
    durationMs: 1100,
    opacityPeak: 0.28,
    strokeWidthPx: 1,
    color: "rgba(140, 190, 255, 0.42)",
  },

  rings: {
    outer: [
      "ocean",
      "dusk",
      "glass",
      "quiet",
      "shadow",
      "winter",
      "rain",
      "echo",
      "steel",
      "smoke",
      "silence",
      "lucid",
      "memory",
      "pale",
      "moon",
      "tide",
      "distance",
    ],
    middle: [
      "hue",
      "salience",
      "diffusion",
      "transition",
      "blur",
      "softness",
      "fade",
      "trace",
      "drift",
      "resonance",
      "afterimage",
      "latent",
    ],
    inner: ["before meaning, color arrives"],
  },

  ringSeparator: " · ",

  svg: {
    viewBoxSize: 1000,
    center: 500,
    radii: {
      outer: 252,
      middle: 200,
      inner: 148,
    },
    startOffsetPct: {
      outer: "0%",
      middle: "12%",
      inner: "24%",
    },
    clipWaterlineY: 500,
  },

  animation: {
    outerSec: 32,
    middleSec: 42,
    innerSec: 60,
    hoverSlowdownFactor: 3.5,
  },

  diskSize: {
    minPx: 360,
    maxPx: 820,
    vwCap: 96,
  },

  colors: {
    title: "#141c2e",
    subtitle: "rgba(20, 28, 46, 0.72)",
    diskRim: "rgba(0, 47, 167, 0.14)",
    diskPlateFill: "rgba(250, 249, 247, 0.05)",
  },
} as const;

export type BlueLexiconHeroConfig = typeof blueLexiconHeroConfig;

/**
 * Underwater fill index from **normalized position** along the closed ring [0,1),
 * plus optional bias (per-ring) and drift (global animation step).
 * Same glyph gets different hues when the ring rotates because clip + motion change
 * what is visible; within the lower half, hue follows arc, not “word identity”.
 */
export function underwaterPaletteIndexForArcPosition(
  charIndexInString: number,
  totalChars: number,
  arcBias: number,
  paletteDriftSteps: number,
  paletteLength: number,
): number {
  if (totalChars <= 0 || paletteLength <= 0) return 0;
  const along = (charIndexInString + 0.5) / totalChars;
  const driftRot = (paletteDriftSteps % 1024) / 1024;
  let u = (along + arcBias + driftRot) % 1;
  if (u < 0) u += 1;
  return Math.floor(u * paletteLength) % paletteLength;
}

/** @deprecated prefer `underwaterPaletteIndexForArcPosition` (position-based) */
export function underwaterPaletteIndex(
  charIndex: number,
  phase: number,
  paletteLength: number,
): number {
  return (charIndex + phase) % paletteLength;
}

export function repeatRingTokens(
  tokens: readonly string[],
  separator: string,
  minChars: number,
): string {
  if (tokens.length === 0) return "";
  const unit = tokens.join(separator);
  let out = unit;
  while (out.length < minChars) {
    out += separator + unit;
  }
  return out;
}

export function ringCharBudget(radius: number, charWidthGuess = 13): number {
  const circumference = 2 * Math.PI * radius;
  return Math.ceil(circumference / charWidthGuess) + 8;
}
