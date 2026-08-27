import { NextResponse } from "next/server";

import { normalizeHex, labObjectFromHex } from "@/lib/colorStudio/colorAdapter";
import {
  LLM_SUGGEST_SYSTEM,
  buildSuggestUserPrompt,
} from "@/lib/colorStudio/llmSuggestPrompt";
import { nearestNamedColor } from "@/lib/colorStudio/colorNaming";
import { parseLlmStripeSpec } from "@/lib/colorStudio/passageStripes";
import type { SuggestedTextColor, SuggestionConfidence } from "@/lib/colorStudio/types";

export const runtime = "nodejs";

const OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions";

type LlmDraft = {
  hex?: string;
  description?: string;
  confidence?: string;
  reason?: string;
  stripes?: unknown;
};

function parseJsonLoose(raw: string): unknown {
  const t = raw.trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as unknown;
    }
    throw new Error("No JSON object in model response");
  }
}

function asConfidence(v: unknown): SuggestionConfidence {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server has no OPENAI_API_KEY configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const passage = String(b.passage ?? "");
  const feelings = Array.isArray(b.feelings)
    ? b.feelings.map((x) => String(x))
    : [];
  const tryAnotherSalt = Number(b.tryAnotherSalt) || 0;

  const model =
    process.env.COLOR_STUDIO_SUGGEST_MODEL?.trim() ||
    process.env.OPENAI_SUGGEST_MODEL?.trim() ||
    "gpt-4o-mini";

  const userContent = buildSuggestUserPrompt(passage, feelings, tryAnotherSalt);

  const completionRes = await fetch(OPENAI_CHAT_COMPLETIONS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: tryAnotherSalt !== 0 ? 1.05 : 0.75,
      messages: [
        { role: "system", content: LLM_SUGGEST_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!completionRes.ok) {
    const errText = await completionRes.text();
    console.error(
      "[color-studio/suggest-color] OpenAI HTTP",
      completionRes.status,
      errText.slice(0, 400),
    );
    return NextResponse.json(
      {
        error: "OpenAI request failed",
        status: completionRes.status,
      },
      { status: 502 },
    );
  }

  const completionJson = (await completionRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = completionJson.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "Empty model reply" }, { status: 502 });
  }

  let parsed: LlmDraft;
  try {
    parsed = parseJsonLoose(raw) as LlmDraft;
  } catch (e) {
    console.error("[color-studio/suggest-color] parse", e);
    return NextResponse.json({ error: "Model did not return valid JSON" }, { status: 502 });
  }

  let hex: string;
  try {
    hex = normalizeHex(String(parsed.hex ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid hex from model" }, { status: 502 });
  }

  const lab = labObjectFromHex(hex);
  const { suggestedName, deltaE } = nearestNamedColor(hex);
  const stripes = parseLlmStripeSpec(parsed.stripes) ?? undefined;

  const out: SuggestedTextColor = {
    hex,
    lab,
    suggestedColorName: suggestedName,
    customColorName: undefined,
    nameSource: "api",
    deltaE,
    description:
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : `A readable wash keyed to your passage (${model}).`,
    confidence: asConfidence(parsed.confidence),
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? `${parsed.reason.trim()} (via ${model})`
        : `Suggested by OpenAI (${model}).`,
    stripes,
  };

  return NextResponse.json(out);
}
