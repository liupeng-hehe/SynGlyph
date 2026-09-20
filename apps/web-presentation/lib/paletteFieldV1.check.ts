import {
  boostProminence,
  boostSpread,
  ellipseVivid,
  letterShow,
  mineLetterStyle,
  planMineVisibility,
  punchHexForMine,
  shadeHexByProminence,
} from "./mineLetterVisual";
import { hexToLab } from "./labColor";
import { detectCombo, glyphsForText, predictWord, wordsForText } from "./paletteFieldV1";

function near(actual: number, expected: number, tol = 0.006): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`expected ${expected}, got ${actual}`);
  }
}

function hexClose(actual: string, expected: string): void {
  const a = actual.replace("#", "").toLowerCase();
  const e = expected.replace("#", "").toLowerCase();
  if (a === e) return;
  const pair = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  for (let i = 0; i < 6; i += 2) {
    if (Math.abs(pair(a, i) - pair(e, i)) > 2) {
      throw new Error(`hex ${actual} too far from ${expected}`);
    }
  }
}

export function runPaletteFieldV1Checks(): string[] {
  const notes: string[] = [];
  const wonder = predictWord("wonder");
  hexClose(wonder[0]!.hex, "#060179");
  near(wonder[0]!.prominence, 0.463);
  near(wonder[0]!.spread, 0.196);
  hexClose(wonder[1]!.hex, "#FDFEFD");
  near(wonder[5]!.prominence, 0.064);
  near(wonder[5]!.spread, 0.7);

  const wander = predictWord("wander");
  hexClose(wander[1]!.hex, "#F91806");
  if (wander[0]!.hex !== wonder[0]!.hex) throw new Error("w color should match");

  const think = predictWord("think");
  if (think[0]!.combo !== "th" || think[1]!.combo !== "th") throw new Error("think should be th");
  hexClose(think[0]!.hex, "#351085");
  hexClose(think[1]!.hex, "#947021");
  near(think[0]!.prominence, 0.329);
  near(think[0]!.spread, 0);

  const ship = predictWord("ship");
  if (detectCombo("ship", 0) !== "sh") throw new Error("ship onset combo");
  hexClose(ship[0]!.hex, "#566778");
  hexClose(ship[1]!.hex, "#4E370C");

  const glyphs = glyphsForText("wonder and wander");
  const letters = glyphs.filter((g) => g.hex);
  if (letters.length !== 15) throw new Error(`expected 15 letters, got ${letters.length}`);
  if (glyphs.some((g) => g.text === " " && g.hex)) throw new Error("spaces should stay ink");
  const packed = wordsForText("wonder and wander");
  if (packed.filter((w) => !w.isSpace).length !== 3) throw new Error("expected 3 words");

  if (boostProminence(0.46) <= 0.46) throw new Error("P boost should lift mid-high values");
  if (boostSpread(0.88) <= boostSpread(0.2)) throw new Error("high S should stay more solid than low S");

  const rawA = "#F91806";
  const punchedA = punchHexForMine(rawA);
  if (punchedA.toLowerCase() === rawA.toLowerCase()) {
    throw new Error("A should gain chroma for display");
  }
  const styleA = mineLetterStyle(rawA, 0.46, 0.2);
  const fill = String(styleA.color ?? "");
  if (/rgb\(\s*1[0-9]\s*,\s*1[0-9]\s*,\s*1[0-9]\s*\)/.test(fill)) {
    throw new Error("letter fill should stay chromatic, not mix toward black");
  }
  const darkA = shadeHexByProminence(rawA, 0.08);
  const brightA = shadeHexByProminence(rawA, 0.62);
  if (hexToLab(darkA).L >= hexToLab(brightA).L) {
    throw new Error("low prominence should darken Lab L");
  }
  if (ellipseVivid(0, 0, 40, 12) < 0.95) throw new Error("ellipse center should be full");
  if (ellipseVivid(12, 0, 40, 12) <= ellipseVivid(0, 12, 40, 12)) {
    throw new Error("horizontal ellipse should fall off slower on x than y");
  }
  near(letterShow(3, true, 1), 1);
  near(letterShow(3, true, 0), 0.6);
  near(letterShow(2, false, 1), 0.4);
  near(letterShow(1, false, 1), 0.2);

  const line = [
    { id: 0, line: 0, col: 0, letters: 5 },
    { id: 1, line: 0, col: 1, letters: 1 },
    { id: 2, line: 0, col: 2, letters: 1 },
    { id: 3, line: 0, col: 3, letters: 6 },
    { id: 4, line: 1, col: 0, letters: 4 },
  ];
  const aroundA = planMineVisibility(line, 1);
  if (aroundA.get(1) !== 3) throw new Error("current short word should be 3");
  if (aroundA.get(0) !== 2 || aroundA.get(2) !== 2) throw new Error("left/right neighbors should be 2");
  if (aroundA.get(3) !== 2) throw new Error("short neighbors should expand toward 8 letters");
  if (aroundA.get(4) !== 1) throw new Error("adjacent line should be 1");
  const aroundLong = planMineVisibility(line, 3);
  if (aroundLong.get(2) !== 2) throw new Error("long word still lights immediate neighbor");
  if (aroundLong.has(0)) throw new Error("long word should not keep expanding past 8 letters");
  notes.push("palette-field v1 checks passed");
  return notes;
}
