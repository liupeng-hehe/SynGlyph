import { getPublicApiUrl } from "./apiBase";

const BASE = getPublicApiUrl();

async function readApiError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((x: unknown) => (typeof x === "object" && x !== null && "msg" in x ? String((x as { msg: string }).msg) : JSON.stringify(x)))
        .join("; ");
    }
  } catch {
    /* ignore */
  }
  return t || `HTTP ${res.status}`;
}

export async function chineseHealth(): Promise<{ product: string; status: string }> {
  const r = await fetch(`${BASE}/api/chinese/health`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export type ChineseGlyphResponse = {
  template: {
    character: string;
    decomposition: string | null;
    matches: unknown;
    strokes: string[];
    medians: number[][][];
    /** Hanzi Writer: stroke indices belonging to the semantic radical (left / 部首) */
    rad_strokes?: number[] | null;
  };
  seed_regions: { id: string; stroke_ids: number[]; label?: string }[];
};

export async function fetchChineseGlyph(char: string): Promise<ChineseGlyphResponse> {
  const enc = encodeURIComponent(char);
  const r = await fetch(`${BASE}/api/chinese/glyph/${enc}`);
  if (r.status === 404) throw new Error("未找到该字的字形数据");
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export type ChineseSessionPayload = {
  id: string;
  dictionary_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  glyph_instances: {
    id: string;
    character: string;
    regions: Record<string, unknown>[];
    transitions: Record<string, unknown>[];
  }[];
};

export type ChineseDictionaryRow = {
  id: string;
  name: string;
  owner: string;
  created_at: string | null;
};

export type ChineseSessionSummary = {
  id: string;
  dictionary_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  character: string;
  region_count: number;
  /** Average region LAB as hex (annotated preview); absent when no regions or no LAB data */
  preview_color_hex?: string | null;
};

export async function listChineseDictionaries(owner?: string): Promise<ChineseDictionaryRow[]> {
  const q = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  const r = await fetch(`${BASE}/api/chinese/dictionaries${q}`);
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export async function createChineseDictionary(name: string, owner: string): Promise<ChineseDictionaryRow> {
  const r = await fetch(`${BASE}/api/chinese/dictionaries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, owner }),
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export async function listChineseSessions(dictionaryId: string): Promise<ChineseSessionSummary[]> {
  const r = await fetch(`${BASE}/api/chinese/sessions?dictionary_id=${encodeURIComponent(dictionaryId)}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export async function createChineseSession(character: string, dictionaryId: string): Promise<ChineseSessionPayload> {
  const r = await fetch(`${BASE}/api/chinese/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character, dictionary_id: dictionaryId }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export type ChineseBulkImportResult = {
  created: number;
  skipped_duplicate: number;
  skipped_no_glyph: string[];
  extracted: string[];
  server_errors?: string[];
};

/** 粘贴中文文本，提取汉字并逐字加入当前字典（与英文 bulk 类似） */
export async function bulkImportChineseSessions(
  text: string,
  dictionaryId: string
): Promise<ChineseBulkImportResult> {
  const r = await fetch(`${BASE}/api/chinese/sessions/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, dictionary_id: dictionaryId }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

/** 从当前字典中删除一条会话（该字不再出现在列表中） */
export async function deleteChineseSession(sessionId: string, dictionaryId: string): Promise<void> {
  const r = await fetch(
    `${BASE}/api/chinese/session/${encodeURIComponent(sessionId)}?dictionary_id=${encodeURIComponent(dictionaryId)}`,
    { method: "DELETE", cache: "no-store" }
  );
  if (!r.ok) throw new Error(await readApiError(r));
}

export async function getChineseSession(sessionId: string): Promise<ChineseSessionPayload> {
  const r = await fetch(`${BASE}/api/chinese/session/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export async function createChineseRegion(body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/chinese/region`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchChineseRegion(regionId: string, body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/chinese/region/${regionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteChineseRegion(regionId: string) {
  const r = await fetch(`${BASE}/api/chinese/region/${regionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createChineseTransition(body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/chinese/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteChineseTransition(transitionId: string) {
  const r = await fetch(`${BASE}/api/chinese/transition/${transitionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchChineseTransition(transitionId: string, body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/chinese/transition/${transitionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}
