/** Synesthesia-themed sentences for BYO effect preview (rotates per coverage word). */

export const BYO_EFFECT_PREVIEW_SENTENCES: readonly string[] = [
  "When words begin to glow.",
  "The dawn comes alive in color.",
  "At last, a luminous dawn of many colors is here.",
  "Each letter carries a hue before meaning arrives.",
  "Color pours through the alphabet like light through rain.",
  "I hear shapes in the shimmer of vowels.",
  "The page breathes in scarlet, cobalt, and gold.",
  "Touch the word and warmth rises in the mind.",
  "Silent letters still flare in the mind's eye.",
  "Meaning arrives dressed in invisible tint.",
  "Come, let my colors dance and let the world bloom.",
  "A word can taste of copper, honey, or winter air.",
  "Consonants ring; vowels open like stained glass.",
  "The sentence hums in a key only I can see.",
  "Ink is never black when feeling is awake.",
  "Letters fall like petals, each with its own light.",
  "Thoughts arrive as color before they become sound.",
  "The alphabet is a ladder of tinted steps.",
  "Some syllables burn; others drift like mist.",
  "Reading is seeing music written in hue.",
  "Every name has a weather inside it.",
  "Language blooms in chromatic waves.",
  "The mind paints what the eye refuses to hold.",
  "Words leave trails of color in their wake.",
  "A phrase can flash like lightning in lavender.",
  "The mouth shapes color as much as sound.",
  "Memory stores words as rooms full of light.",
  "Synesthesia turns grammar into garden paths.",
  "Even silence has a tint at the edge of speech.",
  "Let vision shine through the lattice of letters.",
] as const;

export function effectPreviewSentenceForCoverageWord(
  word: string,
  coverageWords: readonly string[],
  seed = 0,
): string {
  const n = BYO_EFFECT_PREVIEW_SENTENCES.length;
  if (n === 0) return "When words begin to glow.";
  const wl = word.trim().toLowerCase();
  let idx = coverageWords.findIndex((w) => w.toLowerCase() === wl);
  if (idx < 0) {
    let h = seed >>> 0;
    for (let i = 0; i < wl.length; i++) h = (Math.imul(31, h) + wl.charCodeAt(i)) >>> 0;
    idx = h % n;
  }
  return BYO_EFFECT_PREVIEW_SENTENCES[(idx + Math.abs(seed)) % n]!;
}

export const BYO_DEFAULT_EFFECT_PREVIEW_SENTENCE = BYO_EFFECT_PREVIEW_SENTENCES[0]!;
