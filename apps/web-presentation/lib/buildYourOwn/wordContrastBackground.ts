import { BYO_BG } from "@/lib/colorStudio/byoTheme";
import { clampLab, hexToLab, labToHex } from "@/lib/labColor";

/** Default cream behind the coverage word row and annotator columns. */
export const COVERAGE_WORD_BACKGROUND = "#FFFCF3";

type Lab = { L: number; a: number; b: number };

/** Minimum |ΔL| between a letter fill and the backdrop (perceptual separation). */
const MIN_L_CONTRAST = 18;
const LIGHT_LETTER_L = 82;
const VERY_LIGHT_LETTER_L = 88;
const DARK_LETTER_L = 28;

const WARM_BACKGROUND_CANDIDATES: readonly string[] = [
  "#FFF0E5",
  "#FFECD2",
  "#FFE4C4",
  "#FFDCC8",
  "#F5DEB3",
  "#E8D5C4",
  "#EDD9C0",
  "#DFC4A8",
  "#D4B896",
  "#C9A882",
  "#C4A77D",
  "#B8956A",
  "#DDB892",
  "#E6BE8A",
  "#E8C9A0",
  "#FFCCBC",
  "#FFE0B2",
  "#FFF8E1",
  "#FBE9D0",
];

const COOL_LIGHT_CANDIDATES: readonly string[] = [
  COVERAGE_WORD_BACKGROUND,
  BYO_BG,
  "#FFFFFF",
  "#F0F4FF",
  "#EEF6FF",
  "#E8E0F0",
  "#DCE8F5",
  "#EDE8E0",
  "#D6D3D1",
];

const DARK_CANDIDATES: readonly string[] = ["#1E293B", "#262626", "#0F172A"];

function normHex(hex: string): string {
  const h = hex.replace("#", "").trim();
  if (h.length < 6) return "#57534e";
  return `#${h.slice(0, 6)}`;
}

function letterLabs(letterHexes: readonly string[]): Lab[] {
  const out: Lab[] = [];
  for (const raw of letterHexes) {
    try {
      out.push(hexToLab(normHex(raw)));
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

function warmGridCandidates(): string[] {
  const out: string[] = [];
  for (const L of [52, 56, 60, 64, 68, 72, 76, 80]) {
    for (const [a, b] of [
      [4, 18],
      [8, 22],
      [10, 26],
      [6, 14],
      [12, 30],
      [2, 16],
    ] as const) {
      out.push(labToHex(L, a, b));
    }
  }
  return out;
}

/** Target a warm mid-light backdrop when letters span dark ↔ light fills. */
function warmBalancedBackground(labs: Lab[]): string {
  const sortedL = labs.map((l) => l.L).sort((x, y) => x - y);
  const minL = sortedL[0] ?? 50;
  const maxL = sortedL[sortedL.length - 1] ?? 50;
  const targetL = minL + (maxL - minL) * 0.55;

  const n = labs.length;
  const centroid = labs.reduce(
    (acc, l) => ({ L: acc.L + l.L, a: acc.a + l.a, b: acc.b + l.b }),
    { L: 0, a: 0, b: 0 },
  );
  const avgA = centroid.a / n;
  const avgB = centroid.b / n;

  const { L, a, b } = clampLab(
    Math.max(50, Math.min(84, targetL)),
    Math.max(-4, Math.min(16, -avgA * 0.25 + 8)),
    Math.max(12, Math.min(34, -avgB * 0.15 + 20)),
  );
  return normHex(labToHex(L, a, b));
}

function isWarmBackground(lab: Lab): boolean {
  return lab.b >= 8 && lab.a >= -8 && lab.L >= 45 && lab.L <= 88;
}

function letterReadable(letter: Lab, bg: Lab): boolean {
  const dL = Math.abs(letter.L - bg.L);
  if (letter.L >= VERY_LIGHT_LETTER_L) return dL >= 24;
  if (letter.L > LIGHT_LETTER_L) return dL >= 20;
  if (letter.L < DARK_LETTER_L) return dL >= 20;
  if (dL >= MIN_L_CONTRAST) return true;
  const chromaDelta = Math.hypot(letter.a - bg.a, letter.b - bg.b);
  return dL >= 12 && chromaDelta >= 24;
}

function luminanceStats(bg: Lab, letters: Lab[]): { minL: number; avgL: number } {
  const dLs = letters.map((l) => Math.abs(l.L - bg.L));
  return {
    minL: Math.min(...dLs),
    avgL: dLs.reduce((a, b) => a + b, 0) / dLs.length,
  };
}

function scoreBackground(
  bgHex: string,
  letters: Lab[],
): { minL: number; avgL: number; rank: number } | null {
  let bg: Lab;
  try {
    bg = hexToLab(normHex(bgHex));
  } catch {
    return null;
  }

  const hasDark = letters.some((l) => l.L < DARK_LETTER_L);
  const hasLight = letters.some((l) => l.L > LIGHT_LETTER_L);
  const hasVeryLight = letters.some((l) => l.L >= VERY_LIGHT_LETTER_L);

  if (hasDark && bg.L < 42) return null;
  if (hasLight && bg.L > 94) return null;
  if (hasVeryLight && bg.L > 78) return null;
  if (!letters.every((l) => letterReadable(l, bg))) return null;

  const { minL, avgL } = luminanceStats(bg, letters);
  const sortedL = letters.map((l) => l.L).sort((x, y) => x - y);
  const spreadTarget = (sortedL[0] ?? 50) + ((sortedL[sortedL.length - 1] ?? 50) - (sortedL[0] ?? 50)) * 0.48;
  const centerBonus = Math.max(0, 10 - Math.abs(bg.L - spreadTarget) * 0.18);
  const warmBonus = isWarmBackground(bg) ? 14 : 0;
  const coolDarkPenalty = bg.L < 50 && bg.b < 8 ? 20 : 0;
  const lightLetterBonus = hasVeryLight ? Math.max(0, (78 - bg.L) * 0.35) : 0;

  const rank = minL * 1.15 + avgL * 0.12 + centerBonus + warmBonus + lightLetterBonus - coolDarkPenalty;
  return { minL, avgL, rank };
}

function buildCandidates(labs: Lab[]): string[] {
  const hasDark = labs.some((l) => l.L < DARK_LETTER_L);
  const hasVeryLight = labs.some((l) => l.L >= VERY_LIGHT_LETTER_L);
  const balancedWarm = warmBalancedBackground(labs);

  const pool: string[] = [
    ...WARM_BACKGROUND_CANDIDATES,
    ...warmGridCandidates(),
    balancedWarm,
    ...COOL_LIGHT_CANDIDATES,
  ];
  if (hasVeryLight) {
    for (const L of [52, 56, 60, 64, 68]) {
      for (const [a, b] of [
        [6, 20],
        [10, 24],
        [8, 18],
        [4, 16],
      ] as const) {
        pool.push(labToHex(L, a, b));
      }
    }
  }
  if (!hasDark) {
    pool.push(...DARK_CANDIDATES);
  }

  return [...new Set(pool.map(normHex))];
}

export type WordContrastBackgroundSuggestion = {
  hex: string;
  /** Smallest |ΔL| between any letter and this background. */
  minLContrast: number;
  avgLContrast: number;
  defaultMinLContrast: number;
};

/**
 * Pick a readable backdrop for mixed letter fills.
 * Optimizes luminance separation (not raw ΔE), prefers warm mid-tones, and
 * rejects dark/cool panels when the word contains dark letters (e.g. D).
 */
export function farthestBackgroundForLetterColors(
  letterHexes: readonly string[],
): WordContrastBackgroundSuggestion {
  const labs = letterLabs(letterHexes);
  if (labs.length === 0) {
    return {
      hex: COVERAGE_WORD_BACKGROUND,
      minLContrast: 0,
      avgLContrast: 0,
      defaultMinLContrast: 0,
    };
  }

  const defaultBg = hexToLab(COVERAGE_WORD_BACKGROUND);
  const defaultStats = luminanceStats(defaultBg, labs);
  const candidates = buildCandidates(labs);

  let bestHex = COVERAGE_WORD_BACKGROUND;
  let bestMinL = defaultStats.minL;
  let bestAvgL = defaultStats.avgL;
  let bestRank = -Infinity;

  for (const cand of candidates) {
    const scored = scoreBackground(cand, labs);
    if (!scored) continue;
    if (scored.rank > bestRank + 1e-6) {
      bestRank = scored.rank;
      bestMinL = scored.minL;
      bestAvgL = scored.avgL;
      bestHex = normHex(cand);
    }
  }

  if (bestRank === -Infinity) {
    const fallback = warmBalancedBackground(labs);
    const fbStats = luminanceStats(hexToLab(fallback), labs);
    return {
      hex: fallback,
      minLContrast: fbStats.minL,
      avgLContrast: fbStats.avgL,
      defaultMinLContrast: defaultStats.minL,
    };
  }

  if (bestMinL <= defaultStats.minL + 0.8) {
    return {
      hex: COVERAGE_WORD_BACKGROUND,
      minLContrast: defaultStats.minL,
      avgLContrast: defaultStats.avgL,
      defaultMinLContrast: defaultStats.minL,
    };
  }

  return {
    hex: bestHex,
    minLContrast: bestMinL,
    avgLContrast: bestAvgL,
    defaultMinLContrast: defaultStats.minL,
  };
}

/** Semi-transparent canvas fill derived from the word background. */
export function coverageCanvasBackground(rgbaHex: string, alpha = 0.58): string {
  const h = normHex(rgbaHex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function coverageWordLetterHexes(
  word: string,
  letters: Record<string, { color?: string }>,
  indexHex: Record<number, string>,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    const c = word[i]!;
    if (!/[a-z]/i.test(c)) continue;
    const low = c.toLowerCase();
    const row = letters[low];
    let col = indexHex[i] ?? row?.color ?? "#a8a29e";
    if (!col.startsWith("#")) col = `#${col}`;
    out.push(normHex(col));
  }
  return out;
}

export function isCoverageDefaultBackground(hex: string): boolean {
  return normHex(hex).toLowerCase() === COVERAGE_WORD_BACKGROUND.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export type CoverageSpotlightStyle = {
  backgroundColor?: string;
  backgroundImage?: string;
  WebkitMaskImage?: string;
  maskImage?: string;
  filter?: string;
  opacity?: number;
};

/** Default P×S knob position — center of the coverage canvas grid. */
export const COVERAGE_DEFAULT_PXS = { prominence: 0, spread: 0 } as const;

/** Single-origin backlight behind a letter — one pool, corners stay clean. */
function letterBacklightImage(hex: string): string {
  const c = (a: number) => rgbaFromHex(hex, a);
  return `radial-gradient(circle at 50% 50%, ${c(0.2)} 0%, ${c(0.09)} 38%, ${c(0.03)} 54%, transparent 66%)`;
}

/** Soft ceiling wash over the preview word — one source at the top, no axis-aligned bands. */
function wordCeilingWashCore(hex: string): string {
  const c = (a: number) => rgbaFromHex(hex, a);
  return [
    `radial-gradient(ellipse 118% 88% at 50% 0%, ${c(0.2)} 0%, ${c(0.11)} 26%, ${c(0.055)} 44%, ${c(0.022)} 60%, ${c(0.008)} 76%, transparent 90%)`,
    `radial-gradient(ellipse 185% 125% at 50% -6%, ${c(0.045)} 0%, ${c(0.016)} 50%, transparent 82%)`,
  ].join(", ");
}

export type WordSpotlightLayers = {
  height: string;
  core: CoverageSpotlightStyle;
  spread: CoverageSpotlightStyle;
};

/** Preview word: soft overhead lamp (top center), not center-backlight. */
export function wordSpotlightLayers(hex: string): WordSpotlightLayers | null {
  if (isCoverageDefaultBackground(hex)) return null;

  const core: CoverageSpotlightStyle = {
    backgroundColor: "transparent",
    backgroundImage: wordCeilingWashCore(hex),
  };

  const spread: CoverageSpotlightStyle = {
    backgroundColor: "transparent",
    backgroundImage: `radial-gradient(ellipse 220% 155% at 50% -8%, ${rgbaFromHex(hex, 0.06)} 0%, ${rgbaFromHex(hex, 0.022)} 48%, ${rgbaFromHex(hex, 0.008)} 68%, transparent 88%)`,
    filter: "blur(32px)",
    opacity: 0.85,
  };

  return {
    height: "clamp(9rem, 38vw, 16rem)",
    core,
    spread,
  };
}

/** @deprecated use wordSpotlightLayers */
export function wordSpotlightBackdropStyle(hex: string): CoverageSpotlightStyle | null {
  const layers = wordSpotlightLayers(hex);
  if (!layers) return null;
  return layers.core;
}

/** Ring-offset stays page cream so selection rings sit cleanly on the wash. */
export function coverageRingOffsetColor(_hex: string): string {
  return COVERAGE_WORD_BACKGROUND;
}

/** Canvas — uniform cream tile, or flat letter color when user double-clicks the canvas. */
export function canvasCellBackgroundStyle(opts?: { letterCanvasFillHex?: string | null }): CoverageSpotlightStyle {
  const fill = opts?.letterCanvasFillHex;
  if (fill) {
    return {
      backgroundColor: coverageCanvasBackground(fill, 0.9),
    };
  }
  return {
    backgroundColor: coverageCanvasBackground(COVERAGE_WORD_BACKGROUND, 0.58),
  };
}

/** @deprecated use canvasCellBackgroundStyle */
export function canvasSpotlightStyle(_topLightHex?: string | null): CoverageSpotlightStyle {
  return canvasCellBackgroundStyle();
}
