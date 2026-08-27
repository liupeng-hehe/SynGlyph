/** Passage / PDF font picker values — thin / light faces only. */
export type PdfFontFamily =
  | "Cormorant-Garamond"
  | "Raleway"
  | "Josefin-Sans"
  | "Crimson-Pro"
  | "Tenor-Sans"
  | "Outfit"
  | "Montserrat"
  | "Manrope"
  | "Work-Sans"
  | "Lexend"
  | "Literata"
  | "IBM-Plex-Sans";

export const PDF_FONT_OPTIONS: { value: PdfFontFamily; label: string }[] = [
  { value: "Raleway", label: "Raleway · Thin" },
  { value: "Outfit", label: "Outfit · Thin" },
  { value: "Montserrat", label: "Montserrat · Thin" },
  { value: "Manrope", label: "Manrope · Extra Light" },
  { value: "Work-Sans", label: "Work Sans · Thin" },
  { value: "Lexend", label: "Lexend · Thin" },
  { value: "IBM-Plex-Sans", label: "IBM Plex Sans · Thin" },
  { value: "Josefin-Sans", label: "Josefin Sans · Extra Light" },
  { value: "Tenor-Sans", label: "Tenor Sans" },
  { value: "Cormorant-Garamond", label: "Cormorant Garamond · Light" },
  { value: "Crimson-Pro", label: "Crimson Pro · Extra Light" },
  { value: "Literata", label: "Literata · Extra Light" },
];

const THIN_PASSAGE_FONTS = new Set<PdfFontFamily>(PDF_FONT_OPTIONS.map((o) => o.value));

/** Legacy picker values removed in the thin-only refresh. */
const LEGACY_FONT_ALIASES: Record<string, PdfFontFamily> = {
  Helvetica: "Raleway",
  "Times-Roman": "Cormorant-Garamond",
  Courier: "IBM-Plex-Sans",
  Futura: "Outfit",
  Bodoni: "Cormorant-Garamond",
  Garamond: "Cormorant-Garamond",
};

export function isPdfFontFamily(value: string): value is PdfFontFamily {
  return PDF_FONT_OPTIONS.some((o) => o.value === value);
}

/** Map stored / legacy font ids to a supported thin face. */
export function normalizePdfFontFamily(value: string | undefined | null): PdfFontFamily {
  if (value && isPdfFontFamily(value)) return value;
  if (value && value in LEGACY_FONT_ALIASES) return LEGACY_FONT_ALIASES[value];
  return "Raleway";
}

export function isThinPassageFont(pdfFont: PdfFontFamily): boolean {
  return THIN_PASSAGE_FONTS.has(pdfFont);
}

/** Preview/PDF weight — all passage faces stay light. */
export function passageFontWeight(pdfFont: PdfFontFamily): number {
  switch (pdfFont) {
    case "Cormorant-Garamond":
      return 300;
    case "Tenor-Sans":
      return 400;
    case "IBM-Plex-Sans":
    case "Outfit":
    case "Montserrat":
      return 100;
    case "Raleway":
    case "Josefin-Sans":
    case "Crimson-Pro":
    case "Manrope":
    case "Work-Sans":
    case "Lexend":
    case "Literata":
    default:
      return 200;
  }
}

/** Live passage preview — web stacks + next/font CSS variables when present. */
export function cssFontFamily(pdfFont: PdfFontFamily): string {
  switch (pdfFont) {
    case "Cormorant-Garamond":
      return 'var(--font-cormorant-garamond), "Cormorant Garamond", Garamond, Georgia, serif';
    case "Raleway":
      return 'var(--font-raleway), Raleway, "Helvetica Neue", Arial, sans-serif';
    case "Josefin-Sans":
      return 'var(--font-josefin-sans), "Josefin Sans", "Century Gothic", sans-serif';
    case "Crimson-Pro":
      return 'var(--font-crimson-pro), "Crimson Pro", "Times New Roman", serif';
    case "Tenor-Sans":
      return 'var(--font-tenor-sans), "Tenor Sans", "Helvetica Neue", sans-serif';
    case "Outfit":
      return 'var(--font-outfit), Outfit, "Helvetica Neue", Arial, sans-serif';
    case "Montserrat":
      return 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif';
    case "Manrope":
      return 'var(--font-manrope), Manrope, "Helvetica Neue", Arial, sans-serif';
    case "Work-Sans":
      return 'var(--font-work-sans), "Work Sans", "Helvetica Neue", Arial, sans-serif';
    case "Lexend":
      return 'var(--font-lexend), Lexend, "Helvetica Neue", Arial, sans-serif';
    case "Literata":
      return 'var(--font-literata), Literata, "Times New Roman", Georgia, serif';
    case "IBM-Plex-Sans":
      return 'var(--font-ibm-plex-sans), "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
    default:
      return 'var(--font-raleway), Raleway, "Helvetica Neue", Arial, sans-serif';
  }
}

/** @react-pdf/renderer built-ins — map display faces to closest standard PDF fonts. */
export function reactPdfFontFamily(pdfFont: PdfFontFamily): string {
  switch (pdfFont) {
    case "Cormorant-Garamond":
    case "Crimson-Pro":
    case "Literata":
      return "Times-Roman";
    default:
      return "Helvetica";
  }
}

/** Glyph weight for PDF — thin fonts ignore prominence-driven bolding. */
export function passagePdfGlyphWeight(
  pdfFont: PdfFontFamily,
  prominence: number,
): number {
  if (isThinPassageFont(pdfFont)) return passageFontWeight(pdfFont);
  return Math.round(400 + Math.max(0, Math.min(1, prominence)) * 500);
}
