import { getPublicApiUrl } from "./apiBase";

const BASE = getPublicApiUrl();

export async function englishHealth(): Promise<{ product: string; status: string }> {
  const r = await fetch(`${BASE}/api/english/health`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createEnglishSession(wordText?: string) {
  const r = await fetch(`${BASE}/api/english/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word_text: wordText ?? null }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getEnglishSession(sessionId: string) {
  const r = await fetch(`${BASE}/api/english/session/${sessionId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
