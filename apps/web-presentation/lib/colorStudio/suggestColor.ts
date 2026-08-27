import type { SuggestedTextColor, SuggestionInput } from "./types";

import { retrieveColors } from "@/lib/buildYourOwn/colorrecRetrieve";
import { hexFromLab, labObjectFromHex, normalizeHex } from "./colorAdapter";
import { generateOfflineColorNarrative } from "./colorNarrative";
import { nearestNamedColor } from "./colorNaming";

export type SuggestColorMode = "rules" | "llm" | "colorrec";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic noise 0–1 */
function rnd(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const KEYWORD_BUCKETS: {
  keys: string[];
  L: number;
  a: number;
  b: number;
  mood: string;
}[] = [
  {
    keys: ["melancholic", "sad", "grief", "heavy", "somber", "blue"],
    L: 42,
    a: -4,
    b: -18,
    mood: "contemplative depth",
  },
  {
    keys: ["joyful", "bright", "happy", "cheer", "sun", "warm"],
    L: 78,
    a: 8,
    b: 42,
    mood: "radiant warmth",
  },
  {
    keys: ["calm", "peace", "still", "quiet", "soft", "gentle"],
    L: 72,
    a: -12,
    b: 8,
    mood: "quiet clarity",
  },
  {
    keys: ["fierce", "urgent", "fire", "bold", "sharp", "passion"],
    L: 48,
    a: 52,
    b: 38,
    mood: "electric intensity",
  },
  {
    keys: ["tender", "love", "delicate", "romantic", "rose"],
    L: 68,
    a: 28,
    b: -6,
    mood: "gentle intimacy",
  },
  {
    keys: ["mysterious", "night", "shadow", "deep", "cosmic"],
    L: 28,
    a: 12,
    b: -24,
    mood: "nocturnal mystery",
  },
  {
    keys: ["fresh", "mint", "spring", "new", "growth"],
    L: 74,
    a: -32,
    b: 14,
    mood: "verdant freshness",
  },
];

function bucketForFeelings(feelings: string[]): typeof KEYWORD_BUCKETS[number] | null {
  const flat = feelings.join(" ").toLowerCase();
  for (const b of KEYWORD_BUCKETS) {
    if (b.keys.some((k) => flat.includes(k))) return b;
  }
  return null;
}

export function suggestColorByRules(
  input: SuggestionInput,
  tryAnotherSalt = 0,
): SuggestedTextColor {
  const seed = hashSeed(
    `${input.feelings.join("|")}|${input.passage.slice(0, 120)}|alt:${tryAnotherSalt}`,
  );
  const bucket = bucketForFeelings(input.feelings);
  const jitter = tryAnotherSalt > 0 ? tryAnotherSalt * 0.173 : 0;
  let L = bucket?.L ?? 55 + rnd(seed, 1 + jitter) * 18 - 9;
  let a = bucket?.a ?? rnd(seed, 2 + jitter) * 60 - 30;
  let b = bucket?.b ?? rnd(seed, 3 + jitter) * 70 - 35;
  const conflicts =
    input.feelings.length >= 2 ? input.feelings.length > 3 : false;
  L += (rnd(seed, 4) - 0.5) * 14;
  a += (rnd(seed, 5) - 0.5) * 18;
  b += (rnd(seed, 6) - 0.5) * 18;
  L = Math.max(12, Math.min(94, L));
  a = Math.max(-110, Math.min(110, a));
  b = Math.max(-110, Math.min(110, b));

  const hex = normalizeHex(hexFromLab(L, a, b));
  const lab = labObjectFromHex(hex);
  const { suggestedName, deltaE } = nearestNamedColor(hex);

  let confidence: SuggestedTextColor["confidence"] = "medium";
  let reason =
    bucket != null
      ? `Weighted toward "${bucket.keys[0]}"-like cues in your feelings.`
      : "No strong keyword match — exploratory LAB sample from passage hash.";
  if (bucket && input.feelings.length >= 2 && conflicts) {
    confidence = "low";
    reason =
      "Mixed feeling chips dilute the keyword signal; try fewer words for sharper mapping.";
  } else if (bucket && input.passage.trim().length > 40) {
    confidence = "high";
    reason = `Stable mapping from feelings to ${bucket.mood} with passage entropy as tie-breaker.`;
  }

  const description = bucket
    ? `A wash tuned for ${bucket.mood}, anchored to your chosen words.`
    : "An exploratory hue sampled from your text and feeling tokens — nudge with Try Another.";

  return {
    hex,
    lab,
    suggestedColorName: suggestedName,
    customColorName: undefined,
    nameSource: "local",
    deltaE,
    description,
    confidence,
    reason,
  };
}

/** Query text for fine-tuned color retrieval (feelings + passage). */
export function buildColorRecQuery(input: SuggestionInput): string {
  const feelings = input.feelings.map((f) => f.trim()).filter(Boolean).join(", ");
  const passage = input.passage.trim().slice(0, 400);
  if (feelings && passage) return `${feelings}. ${passage}`;
  if (feelings) return feelings;
  if (passage) return passage;
  return "neutral literary passage";
}

function confidenceFromScore(score: number): SuggestedTextColor["confidence"] {
  if (score >= 0.28) return "high";
  if (score >= 0.16) return "medium";
  return "low";
}

/** HPC fine-tuned sentence-transformer via FastAPI /api/colorrec/retrieve. */
export async function suggestColorByColorRec(
  input: SuggestionInput,
  options?: { tryAnotherSalt?: number },
): Promise<SuggestedTextColor> {
  const salt = Math.max(0, options?.tryAnotherSalt ?? 0);
  const query = buildColorRecQuery(input);
  const topK = Math.min(8, salt + 3);

  try {
    const out = await retrieveColors(query, topK);
    const hits = out.results ?? [];
    if (hits.length === 0) {
      throw new Error("colorrec returned no matches");
    }
    const idx = Math.min(salt, hits.length - 1);
    const hit = hits[idx]!;
    const hex = normalizeHex(String(hit.hex ?? "#6b7280"));
    const lab = labObjectFromHex(hex);
    const displayName = String(hit.display_name ?? hit.name ?? "retrieved color");
    const { suggestedName, deltaE } = nearestNamedColor(hex);
    const score = Number(hit.score ?? 0);
    const narrative = generateOfflineColorNarrative({
      hit,
      query,
      suggestionInput: input,
      rank: Number(hit.rank ?? idx + 1),
      score,
    });

    return {
      hex,
      lab,
      suggestedColorName: displayName || suggestedName,
      customColorName: undefined,
      nameSource: "api",
      deltaE,
      description: narrative.description,
      confidence: narrative.confidence ?? confidenceFromScore(score),
      reason: narrative.reason,
    };
  } catch (e) {
    console.warn("[suggestColorByColorRec] fallback to rules:", e);
    const base = suggestColorByRules(input, salt);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      ...base,
      reason: `${base.reason} (colorrec error: ${msg} — rules fallback).`,
      confidence: "low",
    };
  }
}

/** Calls OpenAI on the server; falls back to rules if env/network fails. */
export async function suggestColorByLLM(
  input: SuggestionInput,
  options?: { tryAnotherSalt?: number },
): Promise<SuggestedTextColor> {
  try {
    const res = await fetch("/api/color-studio/suggest-color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passage: input.passage,
        feelings: input.feelings,
        tryAnotherSalt: options?.tryAnotherSalt ?? 0,
      }),
    });

    const data = (await res.json()) as Partial<SuggestedTextColor> & {
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    if (
      typeof data.hex === "string" &&
      typeof data.lab === "object" &&
      data.lab != null &&
      typeof data.reason === "string" &&
      typeof data.description === "string"
    ) {
      return data as SuggestedTextColor;
    }

    throw new Error("Malformed suggestion payload");
  } catch (e) {
    console.warn("[suggestColorByLLM] fallback to rules:", e);
    const salt = options?.tryAnotherSalt ?? 0;
    const base = suggestColorByRules(input, salt);
    const msg =
      e instanceof Error ? e.message : "Unknown error";
    return {
      ...base,
      reason: `${base.reason} (LLM error: ${msg} — rules fallback).`,
      confidence: "low",
    };
  }
}

export async function suggestColor(
  input: SuggestionInput,
  options?: { mode?: SuggestColorMode; tryAnotherSalt?: number },
): Promise<SuggestedTextColor> {
  const salt = options?.tryAnotherSalt ?? 0;
  if (options?.mode === "llm") {
    return suggestColorByLLM(input, { tryAnotherSalt: salt });
  }
  if (options?.mode === "colorrec") {
    return suggestColorByColorRec(input, { tryAnotherSalt: salt });
  }
  return suggestColorByRules(input, salt);
}
