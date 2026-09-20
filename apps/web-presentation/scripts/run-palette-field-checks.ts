import { runPaletteFieldV1Checks } from "../lib/paletteFieldV1.check.ts";

for (const note of runPaletteFieldV1Checks()) {
  console.log(note);
}
