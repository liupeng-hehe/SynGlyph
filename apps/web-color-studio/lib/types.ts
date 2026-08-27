/** Tab 1 letter card + JSON palette */

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
};

export type PdfPageSize = "A4" | "Letter";

export type PdfMargins = { top: number; right: number; bottom: number; left: number };

export type PdfDocumentSettings = {
  backgroundIntensity: number;
  /** Multiplier or curve for text darkness vs background — 0–100 */
  textContrast: number;
  pageSize: PdfPageSize;
  fontFamily: "Helvetica" | "Times-Roman" | "Courier";
  margins: PdfMargins;
};

export type SuggestionInput = {
  passage: string;
  feelings: string[];
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
