import { Document, Image, Page, StyleSheet, View } from "@react-pdf/renderer";

/** BYO-aligned page shell; raster already includes tracked title strip via PNG compositing. */
const BYO_BG = "#FFF8E7";
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: BYO_BG,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    fontFamily: "Helvetica",
  },
  screenshotRow: {
    width: "100%",
    alignItems: "center",
  },
});

type Props = {
  pngDataUrl: string;
  /** Explicit pt size preserves aspect ratio and prevents page clipping (contain-fit vs A4 body). */
  imageWidthPt: number;
  imageHeightPt: number;
};

/**
 * Letter cards embedded as raster from the DOM grid + top “SYNESTHETIC COLOR STUDIO” strip.
 */
export function LetterGridRasterDocument({
  pngDataUrl,
  imageWidthPt,
  imageHeightPt,
}: Props) {
  return (
    <Document title="Synesthetic Letter Cards">
      <Page size="A4" style={styles.page}>
        <View style={styles.screenshotRow}>
          <Image
            src={pngDataUrl}
            style={{ width: imageWidthPt, height: imageHeightPt }}
          />
        </View>
      </Page>
    </Document>
  );
}
