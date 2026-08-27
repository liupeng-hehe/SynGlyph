import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { PdfDocumentSettings } from "@/lib/types";

type Props = {
  passage: string;
  renderedBackgroundHex: string;
  rawBackgroundHex: string | null;
  textColor: string;
  settings: PdfDocumentSettings;
};

export function TextPassageDocument({
  passage,
  renderedBackgroundHex,
  rawBackgroundHex,
  textColor,
  settings,
}: Props) {
  const { margins, fontFamily, pageSize: pageSetting } = settings;
  /** @react-pdf/renderer uses ISO names */
  const pageSize = pageSetting === "Letter" ? "LETTER" : "A4";

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
        <Text
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: textColor,
            fontFamily,
          }}
        >
          {passage.trim() || " "}
        </Text>
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
            Rendered bg {renderedBackgroundHex}
            {rawBackgroundHex ? ` · Raw ${rawBackgroundHex}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
