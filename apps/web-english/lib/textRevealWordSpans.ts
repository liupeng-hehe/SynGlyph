/** Whitespace-separated word spans (token index is stable for a given `text`). */

export interface WordSpan {
  start: number;
  end: number;
  tokenIndex: number;
  text: string;
}

export function enumerateWordSpans(text: string): WordSpan[] {
  const out: WordSpan[] = [];
  let i = 0;
  let ti = 0;
  while (i < text.length) {
    while (i < text.length && /\s/u.test(text[i]!)) i++;
    if (i >= text.length) break;
    const start = i;
    while (i < text.length && !/\s/u.test(text[i]!)) i++;
    const end = i - 1;
    out.push({ start, end, tokenIndex: ti, text: text.slice(start, end + 1) });
    ti++;
  }
  return out;
}

export function findWordSpanAtCharIndex(text: string, charIndex: number): WordSpan | null {
  if (charIndex < 0 || charIndex >= text.length) return null;
  const spans = enumerateWordSpans(text);
  for (const s of spans) {
    if (charIndex >= s.start && charIndex <= s.end) return s;
  }
  return null;
}
