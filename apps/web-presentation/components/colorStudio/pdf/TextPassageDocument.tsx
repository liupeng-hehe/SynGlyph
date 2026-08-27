import { Document, Page, Text, View } from "@react-pdf/renderer";

import { PassagePdfGlyphFlow } from "@/components/colorStudio/pdf/PassagePdfGlyphFlow";
import { pdfContentRect } from "@/lib/colorStudio/pdfPageMetrics";
import { resolvePassageFontSize } from "@/lib/colorStudio/passageBoxes";
import {
  glyphsFromLabTokens,
  glyphsFromPassageAndLetters,
  type LabRenderToken,
} from "@/lib/colorStudio/passageRender";
import { reactPdfFontFamily } from "@/lib/colorStudio/passageFonts";
import type { LetterColor, PassageTextBox, PdfDocumentSettings } from "@/lib/colorStudio/types";

type Props = {
  boxes: PassageTextBox[];
  letters: LetterColor[];
  labTokensByBoxId?: Record<string, LabRenderToken[] | null>;
  renderedBackgroundHex: string;
  rawBackgroundHex: string | null;
  textColor: string;
  settings: PdfDocumentSettings;
};

export function TextPassageDocument({
  boxes,
  letters,
  labTokensByBoxId,
  renderedBackgroundHex,
  rawBackgroundHex,
  textColor,
  settings,
}: Props) {
  const { margins, fontFamily: pdfFont, pageSize: pageSetting } = settings;
  const fontFamily = reactPdfFontFamily(pdfFont);
  const pageSize = pageSetting === "Letter" ? "LETTER" : "A4";
  const content = pdfContentRect(settings);

  const pageStyle = {
    paddingTop: margins.top,
    paddingRight: margins.right,
    paddingBottom: margins.bottom + 22,
    paddingLeft: margins.left,
    backgroundColor: renderedBackgroundHex,
  };

  return (
    <Document title="Synesthetic passage">
      <Page size={pageSize} style={pageStyle}>
        {boxes.map((box) => {
          if (!box.text.trim()) return null;
          const labTokens = labTokensByBoxId?.[box.id];
          const glyphs = labTokens?.length
            ? glyphsFromLabTokens(labTokens)
            : glyphsFromPassageAndLetters(box.text, letters, textColor);
          const fontSize = resolvePassageFontSize(box);
          const visualMode = settings.passageLetterVisual ?? "fill";
          const left = content.x + box.x * content.width;
          const top = content.y + box.y * content.height;
          const width = box.width * content.width;
          const height = box.height * content.height;

          return (
            <View
              key={box.id}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "hidden",
              }}
            >
              <PassagePdfGlyphFlow
                glyphs={glyphs}
                fontSize={fontSize}
                fontFamily={fontFamily}
                pdfFont={pdfFont}
                visualMode={visualMode}
                textAlign={box.textAlign}
              />
            </View>
          );
        })}
        <View
          style={{
            position: "absolute",
            bottom: Math.max(18, margins.bottom * 0.35),
            left: margins.left,
            right: margins.right,
          }}
        >
          <Text
            style={{
              fontSize: 7,
              opacity: 0.55,
              color: textColor,
              fontFamily: "Helvetica",
            }}
          >
            SynGlyph · P×S palette · Rendered bg {renderedBackgroundHex}
            {rawBackgroundHex ? ` · Raw ${rawBackgroundHex}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
