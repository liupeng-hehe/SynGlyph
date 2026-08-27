/** Mirrors `char_units` / n-gram starts in `apps/api/app/services/kb_analytics/text_units.py`. */

export function charUnits(text: string): string[] {
  return [...(text || "").toLowerCase()].filter((c) => c.trim() !== "");
}

function positionsForSubstring(haystackChars: string[], n: number, unit: string): number[] {
  if (unit.length !== n || haystackChars.length < n) return [];
  const starts: number[] = [];
  for (let i = 0; i <= haystackChars.length - n; i++) {
    if (haystackChars.slice(i, i + n).join("") === unit) starts.push(i);
  }
  return starts;
}

/** KB unit types: legacy bigram/trigram plus canonical ngram_k + char. */
export type KbUnitType = "char" | "bigram" | "trigram" | "ngram_2" | "ngram_3" | "ngram_4" | "ngram_5";

function nFromUnitType(unitType: string): number | null {
  if (unitType === "char") return 1;
  if (unitType === "bigram" || unitType === "ngram_2") return 2;
  if (unitType === "trigram" || unitType === "ngram_3") return 3;
  const m = /^ngram_(\d+)$/.exec(unitType);
  if (m) return parseInt(m[1]!, 10);
  return null;
}

function patternPrefixForUnitType(unitType: string): string | null {
  const n = nFromUnitType(unitType);
  if (n === 1) return "char:";
  if (unitType === "bigram") return "bg:";
  if (unitType === "trigram") return "tg:";
  if (n != null && n >= 2) return `ng${n}:`;
  return null;
}

export function parsePatternLiteral(patternKey: string, unitType: string): string | null {
  const prefix = patternPrefixForUnitType(unitType);
  if (!prefix || !patternKey.startsWith(prefix)) return null;
  return patternKey.slice(prefix.length);
}

export function matchStartIndices(word: string, unitType: string, patternKey: string): number[] {
  const raw = parsePatternLiteral(patternKey, unitType);
  if (!raw) return [];
  const ch = charUnits(word);
  const n = nFromUnitType(unitType);
  if (n === 1 && raw.length === 1) {
    return ch.map((c, i) => (c === raw ? i : -1)).filter((i) => i >= 0);
  }
  if (n != null && n >= 2 && raw.length === n) {
    return positionsForSubstring(ch, n, raw);
  }
  return [];
}

/** First occurrence start index in char-units space, or null if no match. */
export function firstMatchCharIndex(word: string, unitType: string, patternKey: string): number | null {
  const idxs = matchStartIndices(word, unitType, patternKey);
  return idxs.length ? idxs[0]! : null;
}
