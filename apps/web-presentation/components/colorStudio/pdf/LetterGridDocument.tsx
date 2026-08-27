import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { LetterColor } from "@/lib/colorStudio/types";
import { stippleSynestheticInkHex } from "@/lib/colorStudio/colorUtils";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    backgroundColor: "#FFF8E7",
  },
  title: {
    fontSize: 14,
    color: "#002FA7",
    marginBottom: 14,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  card: {
    width: "31%",
    height: 132,
    margin: "1%",
    borderRadius: 10,
    padding: 0,
    justifyContent: "flex-end",
    position: "relative",
  },
  letter: {
    position: "absolute",
    top: 13,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 46,
    fontFamily: "Helvetica-Bold",
  },
  metaFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 4,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  meta: {
    fontSize: 7,
    color: "#fafaf9",
    fontFamily: "Helvetica",
    marginTop: 1,
  },
});

export function LetterGridDocument({ letters }: { letters: LetterColor[] }) {
  const pageChunks: LetterColor[][] = [];
  for (let i = 0; i < letters.length; i += 18) {
    pageChunks.push(letters.slice(i, i + 18));
  }

  return (
    <Document title="Synesthetic Letter Cards">
      {pageChunks.map((chunk, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          {pi === 0 ? (
            <Text style={styles.title}>
              Synesthetic Color Studio — Letter cards
            </Text>
          ) : (
            <Text style={[styles.title, { fontSize: 12 }]}>Letter cards (continued)</Text>
          )}
          <View style={styles.row}>
            {chunk.map((lc) => (
              <View key={lc.letter} style={[styles.card, { backgroundColor: lc.hex }]}>
                <Text
                  style={[
                    styles.letter,
                    { color: stippleSynestheticInkHex(lc.hex) },
                  ]}
                >
                  {lc.letter}
                </Text>
                <View style={styles.metaFooter}>
                  <Text style={styles.meta}>
                    {lc.customColorName ?? lc.suggestedColorName}
                  </Text>
                  <Text style={styles.meta}>{lc.hex}</Text>
                  <Text style={styles.meta}>
                    LAB {lc.lab.l.toFixed(1)} · {lc.lab.a.toFixed(1)} ·{" "}
                    {lc.lab.b.toFixed(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}
