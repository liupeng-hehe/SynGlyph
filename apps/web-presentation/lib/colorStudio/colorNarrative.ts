import type { ColorRecHit } from "@/lib/buildYourOwn/colorrecRetrieve";

import { hexToRgb, labObjectFromHex, normalizeHex } from "./colorAdapter";
import type { SuggestedTextColor, SuggestionInput } from "./types";

type NarrativeInput = {
  hit: ColorRecHit;
  query: string;
  suggestionInput: SuggestionInput;
  rank: number;
  score: number;
};

type Tone = {
  lightness: string;
  chroma: string;
  temperature: string;
  contrast: string;
};

const FAMILY_ATMOSPHERE: Record<string, string[]> = {
  black: ["shadow", "ink", "midnight", "quiet pressure"],
  grey: ["mist", "stone", "smoke", "withheld speech"],
  white: ["paper", "linen", "breath", "clear space"],
  brown: ["old paper", "wood", "earth", "archive"],
  yellow: ["candlelight", "honey", "parchment", "soft gold"],
  orange: ["ember", "terracotta", "late sun", "warm signal"],
  red: ["pulse", "velvet", "heat", "emotional pressure"],
  pink: ["blush", "silk", "tenderness", "powdered light"],
  green: ["leaf shade", "sage", "garden air", "quiet growth"],
  blue: ["distance", "rain glass", "harbor air", "evening"],
  purple: ["dusk", "ritual veil", "bruise", "theater"],
};

const FAMILY_VERBS: Record<string, string> = {
  black: "deepens",
  grey: "softens",
  white: "opens",
  brown: "grounds",
  yellow: "warms",
  orange: "animates",
  red: "intensifies",
  pink: "tenderizes",
  green: "refreshes",
  blue: "cools",
  purple: "mystifies",
};

const MOOD_LEXICON: { keys: string[]; phrase: string }[] = [
  { keys: ["memory", "nostalgic", "archive", "old", "remember"], phrase: "recollection and lived time" },
  { keys: ["calm", "quiet", "still", "peace", "gentle"], phrase: "quiet attention" },
  { keys: ["bright", "happy", "luminous", "joy", "sun"], phrase: "lift and clarity" },
  { keys: ["mysterious", "night", "shadow", "secret"], phrase: "suggestion rather than certainty" },
  { keys: ["fierce", "urgent", "fire", "bold", "passion"], phrase: "pressure and intensity" },
  { keys: ["tender", "soft", "love", "intimate"], phrase: "intimacy without sweetness becoming loud" },
  { keys: ["fresh", "spring", "mint", "growth"], phrase: "renewal and breathable space" },
  { keys: ["restless", "electric", "neon", "speed"], phrase: "restless motion" },
  { keys: ["rain", "harbor", "ocean", "blue"], phrase: "cool air and distance" },
  { keys: ["paper", "letter", "book", "ink"], phrase: "a literary, page-like atmosphere" },
];

function compact(text: string, max = 180): string {
  const t = text.trim().split(/\s+/).join(" ");
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

function wordsFrom(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .match(/[a-z][a-z-]{2,}/g)
        ?.filter((w) => !["color", "family", "tone", "wash", "selected"].includes(w)) ?? [],
    ),
  );
}

function extractMoodTags(descriptor?: string): string[] {
  if (!descriptor) return [];
  const match = descriptor.match(/mood tags:\s*([^,.]+(?:,\s*[^,.]+){0,8})/i);
  if (match?.[1]) {
    return match[1]
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
  }
  return wordsFrom(descriptor).slice(0, 5);
}

function toneFromHex(hex: string): Tone {
  const { r, g, b } = hexToRgb(hex);
  const lab = labObjectFromHex(hex);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return {
    lightness:
      lab.l < 28 ? "deep" : lab.l < 50 ? "low-lit" : lab.l < 72 ? "balanced" : lab.l < 88 ? "light" : "pale",
    chroma:
      chroma > 80 || saturation > 0.72
        ? "vivid"
        : chroma > 45 || saturation > 0.42
          ? "colored"
          : chroma > 22
            ? "muted"
            : "soft",
    temperature: lab.b > 20 ? "warm" : lab.b < -18 ? "cool" : "quiet",
    contrast: lab.l < 30 ? "moody" : lab.l > 82 ? "airy" : "readable",
  };
}

function selectMoodPhrase(query: string, input: SuggestionInput, descriptor?: string): string {
  const hay = `${query} ${input.feelings.join(" ")} ${input.passage.slice(0, 300)} ${descriptor ?? ""}`.toLowerCase();
  return MOOD_LEXICON.find((m) => m.keys.some((k) => hay.includes(k)))?.phrase ?? "the emotional texture of the text";
}

function displayFamily(family?: string): string {
  return (family || "color").toLowerCase();
}

function phraseList(items: string[]): string {
  if (items.length === 0) return "subtle atmosphere";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function generateOfflineColorNarrative({
  hit,
  query,
  suggestionInput,
  rank,
  score,
}: NarrativeInput): Pick<SuggestedTextColor, "description" | "reason" | "confidence"> {
  const hex = normalizeHex(String(hit.hex ?? "#6B7280"));
  const family = displayFamily(hit.family);
  const name = String(hit.display_name ?? hit.name ?? "this color");
  const tone = toneFromHex(hex);
  const atmospheres = FAMILY_ATMOSPHERE[family] ?? ["atmosphere", "texture", "light"];
  const verb = FAMILY_VERBS[family] ?? "shapes";
  const moodPhrase = selectMoodPhrase(query, suggestionInput, hit.descriptor);
  const tags = extractMoodTags(hit.descriptor);
  const tagPhrase = phraseList(tags.slice(0, 3));
  const firstAtmosphere = atmospheres[(rank - 1) % atmospheres.length]!;
  const secondAtmosphere = atmospheres[(rank + 1) % atmospheres.length]!;

  const description =
    `A ${tone.lightness}, ${tone.chroma} ${family} wash with the feeling of ${firstAtmosphere}. ` +
    `It ${verb} the passage toward ${moodPhrase}, giving the page ${tagPhrase} while keeping the color ${tone.contrast}.`;

  const readableQuery = compact(query, 120);
  const reason =
    `${name} was selected from the trained color bank because its ${tone.temperature} ${family} profile and ${tone.chroma} chroma fit “${readableQuery}”. ` +
    `Rank ${rank} · score ${score.toFixed(3)} · ${secondAtmosphere}-leaning alternative.`;

  const confidence: SuggestedTextColor["confidence"] =
    score >= 0.28 ? "high" : score >= 0.14 ? "medium" : "low";

  return { description, reason, confidence };
}
