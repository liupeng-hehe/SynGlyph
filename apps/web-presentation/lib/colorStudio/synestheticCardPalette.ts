/**
 * Letter colours from the synesthetic studio card (A–Z).
 * Used by the homepage hero when dots recolour / bloom.
 */
export const SYNESTHETIC_CARD_HEX: Record<string, string> = {
  A: "#F00000",
  B: "#1A0000",
  C: "#FFD54A",
  D: "#000000",
  E: "#FFEEBD",
  F: "#00BCFF",
  G: "#E875B5",
  H: "#935000",
  I: "#FFFFFF",
  J: "#FFB743",
  K: "#009C23",
  L: "#FF7DDC",
  M: "#FFF426",
  N: "#FF7500",
  O: "#FFFEFE",
  P: "#E13BAF",
  Q: "#BE4888",
  R: "#90E155",
  S: "#D2D2D0",
  T: "#037792",
  U: "#B5B468",
  V: "#006C00",
  W: "#1C31AC",
  X: "#307800",
  Y: "#FFF69D",
  Z: "#880000",
};

/** If a card colour is too close to paper, flowers lean toward this companion. */
const FLOWER_COMPANION: Record<string, string> = {
  B: "A",
  D: "Z",
  E: "J",
  I: "F",
  M: "N",
  O: "F",
  S: "P",
  Y: "N",
};

export type Rgb = { r: number; g: number; b: number };

export function hexToRgbSafe(hex: string): Rgb {
  const h = hex.replace("#", "").padStart(6, "0");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

export function cardRgbForLetter(letter: string): Rgb {
  const key = letter.toUpperCase();
  return hexToRgbSafe(SYNESTHETIC_CARD_HEX[key] ?? "#171717");
}

function luminance(c: Rgb): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

/** Dot fill that stays visible on cream paper. */
export function nightDotRgbForLetter(letter: string): Rgb {
  const rgb = cardRgbForLetter(letter);
  if (luminance(rgb) > 188) {
    return mixRgb(rgb, cardRgbForLetter(FLOWER_COMPANION[letter] ?? "N"), 0.55);
  }
  if (luminance(rgb) < 28) {
    return mixRgb(rgb, { r: 80, g: 64, b: 48 }, 0.35);
  }
  return rgb;
}

/** Saturated idle fill for the navy hero; pale cards keep chroma, dark cards lift. */
export function vividHeroRgbForLetter(letter: string): Rgb {
  const key = letter.toUpperCase();
  const rgb = cardRgbForLetter(key);
  const lum = luminance(rgb);
  if (lum < 48) {
    return mixRgb(rgb, { r: 255, g: 168, b: 72 }, 0.4);
  }
  if (lum > 210 && key !== "S") {
    const companion = FLOWER_COMPANION[key];
    if (companion) return mixRgb(rgb, cardRgbForLetter(companion), 0.24);
  }
  return rgb;
}

/** Distinct saturated petals for SYNGLYPH, so neighbouring letters do not share a pink. */
const HERO_FLOWER_HEX: Record<string, string> = {
  S: "#D0E1F1",
  Y: "#F7CACE",
  N: "#BDACD6",
  G: "#7E2A53",
  L: "#FDF9FA",
  P: "#F2AC39",
  H: "#F2EEE9",
};

export function vividFlowerRgbForLetter(letter: string): Rgb {
  const key = letter.toUpperCase();
  const hex = HERO_FLOWER_HEX[key];
  if (hex) return hexToRgbSafe(hex);
  return flowerRgbForLetter(key);
}

/** Saturated petal colour; pale card hues get a companion mix. */
export function flowerRgbForLetter(letter: string): Rgb {
  const rgb = cardRgbForLetter(letter);
  const companion = FLOWER_COMPANION[letter.toUpperCase()];
  if (companion && luminance(rgb) > 170) {
    return mixRgb(rgb, cardRgbForLetter(companion), 0.72);
  }
  return rgb;
}

export function rgbCss(c: Rgb, alpha = 1): string {
  if (alpha >= 0.999) return `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${alpha})`;
}

export function isNightHours(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 18 || h < 6;
}
