/** System prompt: JSON-only, PDF passage wash context */
export const LLM_SUGGEST_SYSTEM = `You are a synesthetic color designer for readable PDF passage backgrounds.

Output a single JSON object with exactly these keys (no markdown fences):
- "hex": string, a 7-char CSS hex like "#1A2B3C", sRGB suitable as a SOFT WASH behind black/dark serif text (not neon, avoid extreme luminance: prefer L* roughly 55–92 for gentle tints unless feelings demand moody darkness).
- "description": string, one or two evocative sentences describing the atmospheric color wash (for the author's UI).
- "confidence": exactly one of "low", "medium", "high"
- "reason": brief plain-language rationale tying passage + feelings to the hue/chroma choices.
- "stripes": object with "angleDeg" (number, e.g. -24 to 24), "periodPx" (number, 48–96), and "bands": array of 3–6 objects each with "hex" (7-char CSS hex sampled from moods in the passage), "weight" (positive number), "opacity" (0.06–0.22) — diagonal wash stripes that echo letter hues in the text, subtle not loud.

Respond ONLY with raw JSON. No trailing commentary.`;

export function buildSuggestUserPrompt(passage: string, feelings: string[], tryAnotherSalt: number): string {
  const clipped = passage.slice(0, 6000).trim();
  const feel = feelings.length ? feelings.join(", ") : "(none selected)";
  const vary =
    tryAnotherSalt !== 0
      ? `\nThe user tapped "Try another" (${tryAnotherSalt}): propose a SECOND plausible alternative visibly different from a typical pick for this passage (still coherent).`
      : "";
  return `Passage (may be excerpt):\n"""\n${clipped || "(empty)"}\n"""\n\nFeelings / mood chips: ${feel}${vary}`;
}
