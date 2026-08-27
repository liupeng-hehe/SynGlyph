/** Strict scope: lowercase English letters a–z only (no uppercase, no mixed case). */

export const LOWERCASE_ENGLISH_LETTERS = "abcdefghijklmnopqrstuvwxyz" as const;

export function isLowercaseEnglishLetter(ch: string): boolean {
  return ch.length === 1 && ch >= "a" && ch <= "z";
}

export function normalizeLowercaseEnglishLetter(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (t.length !== 1) return null;
  return isLowercaseEnglishLetter(t) ? t : null;
}

/** First-experiment subset for validation (structural diversity). */
export const PRIORITY_EXPERIMENT_LETTERS = new Set([
  "b",
  "d",
  "p",
  "q",
  "h",
  "n",
  "m",
  "v",
  "w",
  "x",
]);
