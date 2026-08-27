import { buildLetterColor } from "@/lib/colorUtils";
import type { LetterColor } from "@/lib/types";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function paletteFromHexRecord(obj: Record<string, unknown>): LetterColor[] | null {
  try {
    return AZ.map((ch) => {
      const v = obj[ch] ?? obj[ch.toLowerCase()];
      if (typeof v !== "string") throw new Error("missing hex");
      return buildLetterColor(ch, v, "imported");
    });
  } catch {
    return null;
  }
}

export function normalizeImportedLetters(raw: unknown): LetterColor[] | null {
  if (!Array.isArray(raw) || raw.length !== 26) return null;
  const out: LetterColor[] = [];
  for (let i = 0; i < 26; i++) {
    const row = raw[i];
    const ch = AZ[i];
    if (!row || typeof row !== "object") return null;
    const r = row as Partial<LetterColor>;
    if (typeof r.hex !== "string") return null;
    try {
      out.push(
        buildLetterColor(ch!, r.hex, "imported", {
          customColorName: r.customColorName,
          nameSource: r.customColorName ? "user" : "local",
        }),
      );
    } catch {
      return null;
    }
  }
  return out;
}
