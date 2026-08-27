import { Text, View } from "@react-pdf/renderer";

import { BYO_INK } from "@/lib/colorStudio/byoTheme";
import type { PassageLetterVisualMode } from "@/lib/colorStudio/passageLetterVisual";
import type { PassageGlyph } from "@/lib/colorStudio/passageRender";
import {
  passagePdfGlyphWeight,
  type PdfFontFamily,
} from "@/lib/colorStudio/passageFonts";

const INTRA_WORD_D_MAX_PT = 1.2;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function isLetterGlyph(text: string): boolean {
  return /^[a-zA-Z]$/.test(text);
}

type PdfGlyphProps = {
  glyphs: PassageGlyph[];
  fontSize: number;
  fontFamily: string;
  pdfFont: PdfFontFamily;
  visualMode: PassageLetterVisualMode;
  textAlign: "left" | "center" | "right";
};

function frameOuterOpacity(p: number, s: number): number {
  return Math.min(0.72, 0.38 + p * 0.28 + s * 0.08);
}

function frameOuterScale(p: number, s: number): number {
  return 1.008 + p * 0.014 + s * 0.01;
}

/** Per-glyph passage layout for PDF (supports fill + frame modes). */
export function PassagePdfGlyphFlow({
  glyphs,
  fontSize,
  fontFamily,
  pdfFont,
  visualMode,
  textAlign,
}: PdfGlyphProps) {
  if (!glyphs.length) return null;

  const rows: PassageGlyph[][] = [[]];
  for (const g of glyphs) {
    if (/^\s+$/.test(g.text)) {
      if (rows[rows.length - 1]!.length) rows.push([]);
      continue;
    }
    rows[rows.length - 1]!.push(g);
  }
  if (rows[rows.length - 1]?.length === 0) rows.pop();

  return (
    <View
      style={{
        alignItems:
          textAlign === "center"
            ? "center"
            : textAlign === "right"
              ? "flex-end"
              : "flex-start",
      }}
    >
      {rows.map((row, rowIdx) => (
        <View
          key={`row-${rowIdx}`}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent:
              textAlign === "center"
                ? "center"
                : textAlign === "right"
                  ? "flex-end"
                  : "flex-start",
            marginBottom: rowIdx < rows.length - 1 ? fontSize * 0.35 : 0,
          }}
        >
          {row.map((tok, j) => {
            const fw = passagePdfGlyphWeight(pdfFont, tok.prominence);
            const marginRight =
              j < row.length - 1 && tok.boundaryAfter !== undefined
                ? 1 + clamp01(tok.boundaryAfter) * INTRA_WORD_D_MAX_PT
                : 0;
            const letter = isLetterGlyph(tok.text);

            if (visualMode === "frame" && letter) {
              const p = clamp01(tok.prominence);
              const s = clamp01(tok.spread);
              const outerSize = fontSize * frameOuterScale(p, s);
              return (
                <View
                  key={`${rowIdx}-${j}-${tok.text}`}
                  style={{
                    position: "relative",
                    marginRight,
                    minWidth: fontSize * 0.72,
                    height: fontSize * 1.65,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      position: "absolute",
                      fontSize: outerSize,
                      fontFamily,
                      fontWeight: fw,
                      color: tok.hex,
                      opacity: frameOuterOpacity(p, s),
                    }}
                  >
                    {tok.text}
                  </Text>
                  <Text
                    style={{
                      fontSize,
                      fontFamily,
                      fontWeight: fw,
                      color: BYO_INK,
                    }}
                  >
                    {tok.text}
                  </Text>
                </View>
              );
            }

            return (
              <Text
                key={`${rowIdx}-${j}-${tok.text}`}
                style={{
                  fontSize,
                  fontFamily,
                  fontWeight: fw,
                  color: visualMode === "frame" ? BYO_INK : tok.hex,
                  marginRight,
                  lineHeight: 1.65,
                }}
              >
                {tok.text}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}
