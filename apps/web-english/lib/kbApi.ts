import { getPublicApiUrl } from "./apiBase";

const API_BASE = getPublicApiUrl();

export type KbVersion = {
  id: string;
  label: string;
  word_count: number;
  is_active: boolean;
  source_kind: string | null;
  source_name: string | null;
  created_at: string | null;
};

export type KbPatternMeta = {
  id: string;
  unit_type: string;
  pattern_key: string;
  corpus_freq: number;
};

export type PatternTopWordRow = {
  word: string;
  hits: number;
};

export type PatternTopWordsResponse = {
  pattern: KbPatternMeta;
  top_words: PatternTopWordRow[];
};

export type PatternPositionRow = {
  char_index: number;
  count: number;
};

export type PatternPositionsResponse = {
  positions: PatternPositionRow[];
};

export type NeighborRow = {
  neighbor: string;
  count: number;
  pmi: number | null;
};

export type NeighborsResponse = {
  letter: string;
  side: string;
  neighbors: NeighborRow[];
};

export type UnderCoveredPatternRow = {
  pattern_id: string;
  unit_type: string;
  pattern_key: string;
  count_labeled: number;
  target: number;
  deficit: number;
};

export type SegmentComboRow = {
  combo_key: string;
  count_labeled: number;
};

export type KbLexiconCoverageNote = {
  word_count: number;
  note: string;
};

export type CoverageGapPayload = {
  kb_lexicon?: KbLexiconCoverageNote;
  under_covered_patterns: UnderCoveredPatternRow[];
  segment_combos: SegmentComboRow[];
};

export type CoverageGapsResponse =
  | {
      computed_at: string | null;
      gap: CoverageGapPayload;
    }
  | {
      gap: null;
      detail: string;
    };

export type KbSegmentLabel = { key: string; value: string | null };
export type KbSegmentParam = {
  key: string;
  value_float: number | null;
  json: unknown;
};

export type KbSegmentDetail = {
  id: string;
  span_order: number;
  span_start: number;
  span_end: number;
  source: string | null;
  labels: KbSegmentLabel[];
  params: KbSegmentParam[];
};

export type KbSegmentItem = {
  kb_word_id: string;
  normalized_word: string;
  stimulus_id: string | null;
  segment: KbSegmentDetail;
};

export type KbSegmentsResponse = {
  items: KbSegmentItem[];
};

export type PatternListItem = {
  id: string;
  pattern_key: string;
  corpus_freq: number;
};

export type PatternListResponse = {
  unit_type: string;
  items: PatternListItem[];
};

export async function fetchPatternList(vid: string, unitType: string, limit = 100): Promise<PatternListResponse> {
  const q = new URLSearchParams({ unit_type: unitType, limit: String(limit) });
  const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(vid)}/patterns?${q}`);
  if (!r.ok) throw new Error(`pattern list ${r.status}`);
  return r.json();
}

export async function fetchKbVersions(): Promise<{ items: KbVersion[] }> {
  const r = await fetch(`${API_BASE}/api/kb/catalog/versions`);
  if (!r.ok) throw new Error(`KB versions ${r.status}`);
  return r.json();
}

export async function fetchPatternTopWords(vid: string, patternKey: string): Promise<PatternTopWordsResponse> {
  const r = await fetch(
    `${API_BASE}/api/kb/${encodeURIComponent(vid)}/patterns/${encodeURIComponent(patternKey)}/top-words`
  );
  if (!r.ok) throw new Error(`pattern top words ${r.status}`);
  return r.json();
}

export async function fetchPatternPositions(vid: string, patternKey: string): Promise<PatternPositionsResponse> {
  const r = await fetch(
    `${API_BASE}/api/kb/${encodeURIComponent(vid)}/patterns/${encodeURIComponent(patternKey)}/positions`
  );
  if (!r.ok) throw new Error(`pattern positions ${r.status}`);
  return r.json();
}

export async function fetchNeighbors(vid: string, letter: string, side: "left" | "right"): Promise<NeighborsResponse> {
  const q = new URLSearchParams({ side });
  const r = await fetch(
    `${API_BASE}/api/kb/${encodeURIComponent(vid)}/neighbors/letter/${encodeURIComponent(letter)}?${q}`
  );
  if (!r.ok) throw new Error(`neighbors ${r.status}`);
  return r.json();
}

export async function fetchCoverageGaps(vid: string): Promise<CoverageGapsResponse> {
  const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(vid)}/analytics/coverage-gaps`);
  if (!r.ok) throw new Error(`gaps ${r.status}`);
  return r.json();
}

export type KbSegmentsQuery = {
  word?: string;
  letter?: string;
  pattern?: string;
  limit?: number;
};

export type Coveragetier = {
  covered: number;
  total: number;
  pct: number;
} | null;

export type CoverageRecommendation = {
  word: string;
  new_patterns_covered: number;
  patterns: string[];
};

export type CoverageProgressResponse = {
  vocab_version_id: string;
  char_coverage: Coveragetier;
  bigram_coverage: Coveragetier;
  trigram_coverage: Coveragetier;
  next_recommended: CoverageRecommendation[];
};

export async function fetchCoverageProgress(vid?: string): Promise<CoverageProgressResponse> {
  const url = vid
    ? `${API_BASE}/api/kb/${encodeURIComponent(vid)}/analytics/coverage-progress`
    : `${API_BASE}/api/kb/active/coverage-progress`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`coverage progress ${r.status}`);
  return r.json();
}

export type RebuildMode = "builtin_wordfreq" | "online_hybrid" | "stimuli";

export type RebuildKbRequest = {
  label: string;
  mode: RebuildMode;
  set_active?: boolean;
  builtin_wordfreq_limit?: number;
  max_words?: number | null;
  online_hybrid?: { target_words: number };
};

export type RebuildKbResponse = {
  ok: boolean;
  vocab_version_id: string;
  import_summary?: Record<string, unknown>;
};

export async function rebuildKb(body: RebuildKbRequest): Promise<RebuildKbResponse> {
  const r = await fetch(`${API_BASE}/api/kb/catalog/rebuild`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => String(r.status));
    throw new Error(detail);
  }
  return r.json();
}

export async function deleteKbVersion(vid: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/kb/catalog/versions/${encodeURIComponent(vid)}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => String(r.status));
    throw new Error(detail);
  }
}

export async function setKbVersionActive(vid: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/kb/catalog/versions/${encodeURIComponent(vid)}/set-active`, {
    method: "POST",
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => String(r.status));
    throw new Error(detail);
  }
}

export type TopWordByPatternItem = {
  word: string;
  new_patterns: number;
  new_weight: number;
  total_patterns: number;
  pattern_strings: string[];
  pattern_freqs: number[];
};

export type TopWordsByPatternResponse = {
  min_freq: number;
  total_eligible_patterns: number;
  total_weight: number;
  covered_weight: number;
  items: TopWordByPatternItem[];
};

export async function fetchTopWordsByPatternCount(
  vid: string,
  limit = 30,
  minFreq = 20,
  maxWordLen = 15,
): Promise<TopWordsByPatternResponse> {
  const q = new URLSearchParams({ limit: String(limit), min_freq: String(minFreq), max_word_len: String(maxWordLen) });
  const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(vid)}/words/top-by-pattern-count?${q}`);
  if (!r.ok) throw new Error(`top words ${r.status}`);
  return r.json();
}

export type WeightedCoverageResponse = {
  total_weight: number;
  labeled_weight: number;
  coverage_pct: number;
  total_patterns: number;
  labeled_patterns: number;
};

export async function fetchWeightedCoverage(vid: string): Promise<WeightedCoverageResponse> {
  const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(vid)}/analytics/weighted-coverage`);
  if (!r.ok) throw new Error(`weighted coverage ${r.status}`);
  return r.json();
}

export async function recomputePatterns(vid: string): Promise<{ ok: boolean; words: number; patterns: number }> {
  const r = await fetch(`${API_BASE}/api/kb/${encodeURIComponent(vid)}/analytics/recompute-patterns`, {
    method: "POST",
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => String(r.status));
    throw new Error(detail);
  }
  return r.json();
}

export async function fetchKbSegments(vid: string, query: KbSegmentsQuery): Promise<KbSegmentsResponse> {
  const q = new URLSearchParams();
  if (query.word) q.set("word", query.word);
  if (query.letter) q.set("letter", query.letter);
  if (query.pattern) q.set("pattern", query.pattern);
  if (query.limit != null) q.set("limit", String(query.limit));
  const qs = q.toString();
  const r = await fetch(
    `${API_BASE}/api/kb/${encodeURIComponent(vid)}/segments${qs ? `?${qs}` : ""}`
  );
  if (!r.ok) throw new Error(`KB segments ${r.status}`);
  return r.json();
}
