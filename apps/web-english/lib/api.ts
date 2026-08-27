import type {
  Dataset,
  Stimulus,
  Session,
  AnnotationResponse,
  CreateStimulusRequest,
  CreateAnnotationRequest,
  SegmentMemoryResponse,
  LetterPriorsResponse,
  PrioritizedStimulus,
  RawCandidateDTO,
  EnrichedCandidateDTO,
  RankedCandidateDTO,
  DemandProfile,
} from "@synglyph/shared";

import { getPublicApiUrl } from "./apiBase";

const API_BASE = getPublicApiUrl();

function wrapFetchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Failed to fetch") {
    return new Error(`无法连接 API (${API_BASE})，请确认后端已启动`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function listDatasets(owner?: string | null): Promise<Dataset[]> {
  try {
    const params = owner ? `?owner=${encodeURIComponent(owner)}` : "";
    const res = await fetch(`${API_BASE}/api/datasets${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function createDataset(
  name: string,
  owner: string,
  migrateFromDatasetId?: string | null
): Promise<Dataset> {
  const res = await fetch(`${API_BASE}/api/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      owner,
      migrate_from_dataset_id: migrateFromDatasetId || undefined,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteDataset(datasetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/datasets/${datasetId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function importAlphabetToDataset(
  datasetId: string,
  sourceDatasetId: string
): Promise<{ imported: number; session_id: string }> {
  const res = await fetch(
    `${API_BASE}/api/datasets/${datasetId}/import-alphabet?source_dataset_id=${encodeURIComponent(sourceDatasetId)}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface CountSummary {
  total: number;
  annotated: number;
}

export async function getRawExport(datasetId: string | null): Promise<{
  stimuli: { id: string; text: string; language: string; source_type: string }[];
  annotated: Record<string, { raw_input?: string; spans?: unknown[]; boundary_influence?: number[] }>;
}> {
  const url = datasetId
    ? `${API_BASE}/api/stimuli/raw-export?dataset_id=${encodeURIComponent(datasetId)}`
    : `${API_BASE}/api/stimuli/raw-export`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getCountSummary(
  datasetId: string | null,
  includeAll = false
): Promise<CountSummary> {
  const q = new URLSearchParams();
  if (datasetId) q.set("dataset_id", datasetId);
  if (includeAll) q.set("include_all", "true");
  const url = `${API_BASE}/api/stimuli/count-summary${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function bulkImportStimuli(
  text: string,
  language = "en",
  sourceType = "bulk",
  datasetId?: string | null
): Promise<{ created: number; skipped: number; words: string[] }> {
  const res = await fetch(`${API_BASE}/api/stimuli/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language,
      source_type: sourceType,
      dataset_id: datasetId ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface UpsertStimuliFromEvaluationResult {
  created: number;
  existing: number;
  created_words: string[];
  existing_words: string[];
  dataset_id: string | null;
}

export async function upsertStimuliFromEvaluation(params: {
  text: string;
  datasetId?: string | null;
  checkpointId?: string | null;
  saveMode?: string | null;
  reviewOutcome?: string | null;
  language?: string;
}): Promise<UpsertStimuliFromEvaluationResult> {
  const res = await fetch(`${API_BASE}/api/stimuli/upsert-from-evaluation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      dataset_id: params.datasetId ?? null,
      checkpoint_id: params.checkpointId ?? null,
      save_mode: params.saveMode ?? null,
      review_outcome: params.reviewOutcome ?? null,
      language: params.language ?? "en",
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createStimulus(body: CreateStimulusRequest): Promise<Stimulus> {
  const res = await fetch(`${API_BASE}/api/stimuli`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function listStimuli(limit = 5000, datasetId?: string | null): Promise<Stimulus[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (datasetId) params.set("dataset_id", datasetId);
    const res = await fetch(`${API_BASE}/api/stimuli?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function listPendingStimuli(
  limit = 5000,
  datasetId?: string | null
): Promise<Stimulus[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit), exclude_existing: "true", exclude_selected: "false" });
    if (datasetId) params.set("dataset_id", datasetId);
    const res = await fetch(`${API_BASE}/api/stimuli?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function getAnnotatedStimulusIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/stimuli/annotated-ids`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.stimulus_ids ?? [];
}

export interface AnnotatedSummaryItem {
  stimulus_id: string;
  text: string;
  whole_word_hex: string;
}

export async function getAnnotatedSummary(
  datasetId?: string | null
): Promise<AnnotatedSummaryItem[]> {
  try {
    const url = datasetId
      ? `${API_BASE}/api/stimuli/annotated-summary?dataset_id=${encodeURIComponent(datasetId)}`
      : `${API_BASE}/api/stimuli/annotated-summary`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function getStimulus(id: string): Promise<Stimulus> {
  const res = await fetch(`${API_BASE}/api/stimuli/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface LetterSequencePredictResponse {
  stimulus_id?: string;
  word_text: string;
  pred_lab: [number, number, number][];
  pred_prominence: number[];
  pred_spread: number[];
  pred_boundary: number[];
  preprocessing?: {
    syllable_count: number;
    stress_pattern: string;
    pronunciation_source: string;
    parse_confidence: number;
    preprocessing_version?: string;
  };
  letters_detail?: Array<{
    idx: number;
    ch: string;
    syllable_idx?: number;
    in_stressed_syllable?: boolean;
    pred_lab?: [number, number, number];
    pred_prominence?: number;
  }>;
  pairwise?: Array<{
    left: number;
    right: number;
    pred_boundary: number;
    pred_spread_pair: number;
  }>;
  word?: {
    suggested_best_lab: [number, number, number];
    dominant_letter_idx: number;
    confidence_tier: string;
  };
  /** Present when the API ran PyTorch or ONNX (deploy) path. */
  inference_backend?: "pytorch" | "onnx" | string;
  checkpoint_id?: string | null;
  runtime_note?: string | null;
}

/** Stable manifest entry from ``GET /api/models/checkpoints``. */
export interface ModelRuntimeCheckpoint {
  checkpoint_id: string;
  path: string;
  model_family: string;
  is_stable: boolean;
  config_path?: string | null;
  has_onnx: boolean;
  parity_status: string;
  onnx_path?: string | null;
  onnx_dir?: string | null;
  parity_report_path?: string | null;
  pytorch_available: boolean;
  export_time?: string | null;
  notes?: string;
}

export async function listModelRuntimeCheckpoints(): Promise<{
  manifest_path: string;
  checkpoints: ModelRuntimeCheckpoint[];
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/api/models/checkpoints`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getLetterSequencePredict(
  stimulusId: string
): Promise<LetterSequencePredictResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/letter-sequence/predict/${encodeURIComponent(stimulusId)}`);
  } catch (e) {
    throw wrapFetchError(e);
  }
  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string | { msg?: string }[] };
      if (typeof err.detail === "string") detail = err.detail;
      else if (Array.isArray(err.detail))
        detail = err.detail.map((x) => (typeof x === "object" && x && "msg" in x ? String(x.msg) : String(x))).join(", ");
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function predictLetterSequenceText(
  text: string,
  snapshotId?: string | null,
  options?: {
    /** When set, the stable manifest path wins over ``snapshotId`` (backend ONNX deploy test). */
    checkpointId?: string | null;
    /** Default ``pytorch``; set ``onnx`` only when a matching ``model.onnx`` exists. */
    backend?: "pytorch" | "onnx";
  }
): Promise<LetterSequencePredictResponse> {
  const useStable = options?.checkpointId && options.checkpointId.length > 0;
  const body: Record<string, unknown> = {
    text,
    snapshot_id:
      useStable ? null : snapshotId && snapshotId.length > 0 ? snapshotId : null,
    checkpoint_id: useStable ? options?.checkpointId : null,
    backend: options?.backend ?? "pytorch",
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/letter-sequence/predict-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw wrapFetchError(e);
  }
  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string | { msg?: string }[] };
      if (typeof err.detail === "string") detail = err.detail;
      else if (Array.isArray(err.detail))
        detail = err.detail.map((x) => (typeof x === "object" && x && "msg" in x ? String(x.msg) : String(x))).join(", ");
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteStimulus(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/stimuli/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function createSession(): Promise<Session> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function createAnnotation(
  body: CreateAnnotationRequest
): Promise<AnnotationResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error && e.message === "Failed to fetch"
      ? `Cannot reach API at ${API_BASE}. Is the backend running?`
      : (e instanceof Error ? e.message : String(e));
    throw new Error(msg);
  }
  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    if (res.status === 422) {
      const err = await res.json().catch(() => ({}));
      msg += ` ${JSON.stringify(err)}`;
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function commitAnnotation(body: CreateAnnotationRequest & {
  selected_list_id: string;
  word: string;
  annotation_version?: string;
  notes?: string;
  predicted_segments?: Array<{ text_span: string; color_lab: [number, number, number]; prominence: number; spread: number }>;
  edit_burden?: number;
}): Promise<{
  annotation_id: string;
  registry_status: string;
  excluded_future: boolean;
  selected_list_id: string;
}> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/annotation/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error && e.message === "Failed to fetch"
      ? `Cannot reach API at ${API_BASE}. Is the backend running?`
      : (e instanceof Error ? e.message : String(e));
    throw new Error(msg);
  }
  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string | { msg?: string }[] };
      if (typeof err.detail === "string") msg = err.detail;
      else if (Array.isArray(err.detail)) {
        msg = err.detail
          .map((x) => (typeof x === "object" && x && "msg" in x ? String(x.msg) : String(x)))
          .join(", ");
      }
    } catch {
      /* ignore body parse errors */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function listAnnotations(
  limit = 20,
  sessionId?: string,
  stimulusId?: string
): Promise<AnnotationResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sessionId) params.set("session_id", sessionId);
  if (stimulusId) params.set("stimulus_id", stimulusId);
  const res = await fetch(`${API_BASE}/api/annotations?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getAnnotation(id: string): Promise<AnnotationResponse> {
  const res = await fetch(`${API_BASE}/api/annotations/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchLetterPriors(
  datasetIds?: string[] | null
): Promise<LetterPriorsResponse> {
  try {
    const params = new URLSearchParams();
    if (datasetIds?.length) params.set("dataset_ids", datasetIds.join(","));
    const url = `${API_BASE}/api/letter-priors${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function listSegmentMemory(
  minCount = 1,
  limit = 100
): Promise<SegmentMemoryResponse[]> {
  const res = await fetch(
    `${API_BASE}/api/segment-memory?min_count=${minCount}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function refreshSegmentMemory(): Promise<{
  mined: number;
  total_occurrences: number;
}> {
  const res = await fetch(`${API_BASE}/api/segment-memory/refresh`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateSegmentMemory(
  segmentId: string,
  body: { segment_text?: string; rejected?: boolean }
): Promise<SegmentMemoryResponse | { deleted: string }> {
  const res = await fetch(`${API_BASE}/api/segment-memory/${segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function mergeSegmentMemory(
  targetSegmentId: string,
  sourceSegmentId: string
): Promise<{ merged_into: string; deleted: string }> {
  const res = await fetch(`${API_BASE}/api/segment-memory/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_segment_id: targetSegmentId,
      source_segment_id: sourceSegmentId,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function bootstrapImport(): Promise<{
  status: string;
  created?: number;
  skipped?: number;
  selected_count?: number;
  pool_size?: number;
  timestamp?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/api/import/bootstrap`, { method: "POST" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getImportStatus(): Promise<{
  status: string;
  created?: number;
  skipped?: number;
  timestamp?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/api/import/status`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getPrioritizedStimuli(
  limit = 50,
  selectedListId?: string | null,
  excludeExisting = true,
  excludeSelected = true,
  candidateSource: "stimulus" | "kb" = "stimulus",
  tieBreakMode?: "none" | "hash" | "random" | null
): Promise<{
  rows: PrioritizedStimulus[];
  meta: {
    model_snapshot_id?: string | null;
    scoring_stage?: string | null;
    snapshot_time?: string | null;
    refresh_batch_id?: string | null;
  };
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (selectedListId) params.set("selected_list_id", selectedListId);
  params.set("exclude_existing", String(excludeExisting));
  params.set("exclude_selected", String(excludeSelected));
  params.set("candidate_source", candidateSource);
  if (tieBreakMode) params.set("tie_break_mode", tieBreakMode);
  const res = await fetch(`${API_BASE}/api/active-learning/prioritized?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function refreshPrioritizedStimuli(
  limit = 50,
  selectedListId?: string | null,
  excludeExisting = true,
  excludeSelected = true,
  candidateSource: "stimulus" | "kb" = "stimulus",
  tieBreakMode?: "none" | "hash" | "random" | null
): Promise<{
  ok: boolean;
  rows_written: number;
  refresh_batch_id: string;
  meta: {
    model_snapshot_id?: string | null;
    scoring_stage?: string | null;
    snapshot_time?: string | null;
    refresh_batch_id?: string | null;
  };
}> {
  const res = await fetch(`${API_BASE}/api/active-learning/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      limit,
      selected_list_id: selectedListId ?? null,
      exclude_existing: excludeExisting,
      exclude_selected: excludeSelected,
      candidate_source: candidateSource,
      tie_break_mode: tieBreakMode ?? null,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function registryCheck(word: string, selectedListId: string): Promise<{
  exists: boolean;
  word: string;
  normalized_word: string;
  selected_list_id: string;
  status?: string | null;
  first_seen_at?: string | null;
  annotated_at?: string | null;
  annotation_version?: string | null;
}> {
  const q = new URLSearchParams({ word, selected_list_id: selectedListId });
  const res = await fetch(`${API_BASE}/api/registry/check?${q}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function filterCandidates(params: {
  selected_list_id: string;
  candidates: RawCandidateDTO[];
  exclude_existing?: boolean;
  exclude_selected?: boolean;
}): Promise<{ accepted: RawCandidateDTO[]; excluded: EnrichedCandidateDTO[] }> {
  const res = await fetch(`${API_BASE}/api/pattern-supply/candidates/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selected_list_id: params.selected_list_id,
      candidates: params.candidates,
      exclude_existing: params.exclude_existing ?? true,
      exclude_selected: params.exclude_selected ?? true,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function topSupplyRecommendations(params: {
  selected_list_id: string;
  top_k?: number;
  exclude_existing?: boolean;
  exclude_selected?: boolean;
  demand_profile_override?: DemandProfile | null;
}): Promise<{
  rows: RankedCandidateDTO[];
  degraded: boolean;
  degrade_reasons: string[];
  profile_version: string;
  batch_id?: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/pattern-supply/recommendations/top`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selected_list_id: params.selected_list_id,
      top_k: params.top_k ?? 50,
      exclude_existing: params.exclude_existing ?? true,
      exclude_selected: params.exclude_selected ?? true,
      demand_profile_override: params.demand_profile_override ?? null,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function refreshDemandProfile(selectedListId: string, force = false): Promise<{
  profile: DemandProfile;
  refreshed: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/pattern-supply/demand-profile/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_list_id: selectedListId, force }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** List glyph ids that already have a JSON file on the server (per script folder). */
export async function listGlyphSegmentGlyphs(script: "en" | "zh" = "en"): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/glyph-segments?script=${encodeURIComponent(script)}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { glyphs?: string[] };
    return Array.isArray(data.glyphs) ? data.glyphs : [];
  } catch {
    return [];
  }
}

/** Line-cut glyph segmentation v2 JSON → repo data/glyph_segments/{script}/ (API writes file). */
export async function saveGlyphSegmentDocument(
  doc: Record<string, unknown>,
  script: "en" | "zh" = "en"
): Promise<{ ok: boolean; path: string; script: string }> {
  const res = await fetch(
    `${API_BASE}/api/glyph-segments?script=${encodeURIComponent(script)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }
  );
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { detail?: unknown };
      const d = j?.detail;
      detail =
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? JSON.stringify(d)
            : JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `API error: ${res.status}`);
  }
  return res.json();
}

/** Lowercase primitive graph (graph-first export; not UMAP-based). */
export async function listGlyphGraphRecords(): Promise<{
  chars: string[];
  items: {
    char: string;
    id: string;
    status: string;
    image_width: number | null;
    image_height: number | null;
    updated_at: string | null;
  }[];
}> {
  const res = await fetch(`${API_BASE}/api/glyph-graphs`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getGlyphGraphPayload(char: string): Promise<Record<string, unknown>> {
  const c = char.trim().toLowerCase();
  const res = await fetch(`${API_BASE}/api/glyph-graphs/${encodeURIComponent(c)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function saveGlyphGraphPayload(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  char: string;
  id: string;
}> {
  const res = await fetch(`${API_BASE}/api/glyph-graphs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { detail?: unknown };
      const d = j?.detail;
      detail =
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? JSON.stringify(d)
            : JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `API error: ${res.status}`);
  }
  return res.json();
}

export async function exportAllGlyphGraphPayloads(): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}/api/glyph-graphs/export/all`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Canonical ids (match ``letter_sequence.models.model_factory``; no task-prefixed aliases). */
export type LetterSequenceModelFamily = "bilstm" | "mlp" | "transformer_encoder";

/**
 * Payload for POST /api/training/runs. Always includes ``model_family`` and a superset of fields;
 * the API / trainer only consume keys relevant to the selected family.
 */
export interface TrainingHyperParams {
  model_family: LetterSequenceModelFamily;
  epochs: number;
  learning_rate: number;
  batch_size: number;
  dropout: number;
  weight_decay: number;
  train_ratio: number;
  split_seed: number;
  loss_lab: number;
  loss_prominence: number;
  loss_spread: number;
  loss_boundary: number;
  /** BiLSTM hidden dim; MLP ``hidden_dim``; not used for transformer trunk width (see ff_dim). */
  hidden_size: number;
  num_layers: number;
  emb_dim: number;
  pos_dim: number;
  /** Used when model_family is transformer_encoder; sent for all families for backward compatibility. */
  nhead: number;
  ff_dim: number;
}

export interface TrainingRun {
  id: string;
  status: string;
  dataset_id: string | null;
  out_dir: string;
  config_json: string;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  best_val_loss: number | null;
  n_samples: number | null;
  n_unique_words: number | null;
  process_pid: number | null;
}

export interface TrainingMetrics {
  run_id: string;
  status: string;
  progress: Record<string, unknown> | null;
  metrics_json: Record<string, unknown> | null;
}

export interface ModelSnapshot {
  id: string;
  training_run_id: string;
  name: string;
  checkpoint_uri: string;
  config_json: string;
  best_val_loss: number | null;
  n_samples: number | null;
  n_unique_words: number | null;
  created_at: string;
  /** Omitted on legacy rows; see Workbench fallback label (display-only). */
  model_family?: string | null;
}

export async function listTrainingRuns(limit = 30): Promise<TrainingRun[]> {
  const res = await fetch(`${API_BASE}/api/training/runs?limit=${limit}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function createTrainingRun(
  datasetId: string | null,
  hyperparams: TrainingHyperParams
): Promise<TrainingRun> {
  const res = await fetch(`${API_BASE}/api/training/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_id: datasetId || null, hyperparams }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `API error: ${res.status}`);
  }
  return res.json();
}

export async function getTrainingRun(runId: string): Promise<TrainingRun> {
  const res = await fetch(`${API_BASE}/api/training/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getTrainingMetrics(runId: string): Promise<TrainingMetrics> {
  const res = await fetch(`${API_BASE}/api/training/runs/${encodeURIComponent(runId)}/metrics`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function stopTrainingRun(runId: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/api/training/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function saveModelSnapshot(runId: string, name?: string | null): Promise<ModelSnapshot> {
  const res = await fetch(`${API_BASE}/api/training/runs/${encodeURIComponent(runId)}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || null }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `API error: ${res.status}`);
  }
  return res.json();
}

export async function listModelSnapshots(limit = 50): Promise<ModelSnapshot[]> {
  const res = await fetch(`${API_BASE}/api/training/snapshots?limit=${limit}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface ExportSnapshotOnnxResponse {
  ok: boolean;
  snapshot_id: string;
  checkpoint_path: string;
  output_dir: string;
  report: Record<string, unknown>;
}

/**
 * Write ``model.onnx`` + ``export_report.json`` next to the snapshot checkpoint
 * (default: ``<checkpoint_dir>/onnx_runtime``). Requires API env ``ENABLE_MODEL_RUNTIME_MUTATIONS=1``.
 * Only **bilstm** snapshots are supported.
 */
export async function exportTrainingSnapshotToOnnx(
  snapshotId: string,
  options?: { outputDir?: string | null }
): Promise<ExportSnapshotOnnxResponse> {
  const q =
    options?.outputDir && options.outputDir.trim()
      ? `?output_dir=${encodeURIComponent(options.outputDir.trim())}`
      : "";
  const res = await fetch(
    `${API_BASE}/api/training/snapshots/${encodeURIComponent(snapshotId)}/export-onnx${q}`,
    { method: "POST" }
  );
  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string | { msg?: string }[] };
      if (typeof err.detail === "string") detail = err.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}
