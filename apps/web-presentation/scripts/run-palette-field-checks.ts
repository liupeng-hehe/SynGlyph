import { runPaletteFieldV1Checks } from "../lib/paletteFieldV1.check";

for (const note of runPaletteFieldV1Checks()) {
  console.log(note);
}
