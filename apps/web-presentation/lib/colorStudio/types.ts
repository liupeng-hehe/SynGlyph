/** Tab 1 letter card + JSON palette */

import type { PdfFontFamily } from "./passageFonts";
import type { PassageLetterVisualMode } from "./passageLetterVisual";

export type { PdfFontFamily };
export type { PassageLetterVisualMode };

export type NameSource = "local" | "api" | "user";

export type PaletteOrigin = "generated" | "imported" | "default";

export type LetterColor = {
  letter: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  lab: { l: number; a: number; b: number };
  suggestedColorName: string;
  customColorName?: string;
  nameSource: NameSource;
  deltaE?: number;
  paletteOrigin?: PaletteOrigin;
  /** Model-space [0,1] — English SegmentInput.prominence */
  prominence?: number;
  /** Model-space [0,1] — English SegmentInput.spread */
  spread?: number;
};

/** Tab 2 suggestion output */

export type SuggestionConfidence = "low" | "medium" | "high";

export type SuggestedTextColor = {
  hex: string;
  lab: { l: number; a: number; b: number };
  suggestedColorName: string;
  customColorName?: string;
  nameSource: NameSource;
  deltaE?: number;
  description: string;
  confidence: SuggestionConfidence;
  reason: string;
  /** Optional atmospheric stripe wash (from OpenAI or rules). */
  stripes?: {
    angleDeg: number;
    periodPx: number;
    bands: { hex: string; weight: number; opacity: number }[];
  };
};

export type PdfPageSize = "A4" | "Letter";

export type PdfMargins = { top: number; right: number; bottom: number; left: number };

export type PdfDocumentSettings = {
  backgroundIntensity: number;
  /** Multiplier or curve for text darkness vs background — 0–100 */
  textContrast: number;
  pageSize: PdfPageSize;
  fontFamily: PdfFontFamily;
  margins: PdfMargins;
  /** Passage letter rendering: fill vs color+P×S outer frame */
  passageLetterVisual: PassageLetterVisualMode;
};

export type SuggestionInput = {
  passage: string;
  feelings: string[];
};

/** Tab 2 — positioned text region on the passage canvas (% of preview area). */
export type PassageTextBox = {
  id: string;
  text: string;
  /** 0–1 from canvas left */
  x: number;
  /** 0–1 from canvas top */
  y: number;
  /** 0–1 of canvas width */
  width: number;
  /** 0–1 of canvas height */
  height: number;
  /** Font size in px (preview) / pt (PDF export) */
  fontSize: number;
  textAlign: "left" | "center" | "right";
};

/** Phase 4 */

export type SavedPalette = {
  id: string;
  name: string;
  letters: LetterColor[];
  updatedAt: number;
};

export type UserProfile = {
  id: string;
  displayName: string;
};

export type StudioPersistence = {
  version: 1;
  activeProfileId: string;
  profiles: UserProfile[];
  palettes: SavedPalette[];
};
