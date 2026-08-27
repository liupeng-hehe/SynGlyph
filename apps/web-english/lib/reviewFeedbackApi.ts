import type { ModelFeedbackRecord } from "@/lib/modelFeedbackTypes";

import { getPublicApiUrl } from "./apiBase";

const API_BASE = getPublicApiUrl();

function wrapFetchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Failed to fetch") {
    return new Error(`无法连接 API (${API_BASE})，请确认后端已启动`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function postReviewFeedback(record: Omit<ModelFeedbackRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<ModelFeedbackRecord> {
  try {
    const res = await fetch(`${API_BASE}/api/review-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = typeof err.detail === "string" ? err.detail : `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return res.json() as Promise<ModelFeedbackRecord>;
  } catch (e) {
    throw wrapFetchError(e);
  }
}

/** Fetch by checkpoint only (avoids long URLs); optionally filter by full document text client-side. */
export async function listReviewFeedback(checkpointId: string, textFilter?: string): Promise<ModelFeedbackRecord[]> {
  const params = new URLSearchParams();
  params.set("checkpointId", checkpointId);
  try {
    const res = await fetch(`${API_BASE}/api/review-feedback?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as ModelFeedbackRecord[];
    if (textFilter === undefined) return rows;
    return rows.filter((r) => r.text === textFilter);
  } catch (e) {
    throw wrapFetchError(e);
  }
}

export async function patchReviewFeedback(
  id: string,
  patch: Partial<Pick<ModelFeedbackRecord, "feedback" | "prediction" | "selectedSpan">>
): Promise<ModelFeedbackRecord> {
  const body: Record<string, unknown> = {};
  if (patch.feedback !== undefined) body.feedback = patch.feedback;
  if (patch.prediction !== undefined) body.prediction = patch.prediction;
  if (patch.selectedSpan !== undefined) body.selectedSpan = patch.selectedSpan;
  try {
    const res = await fetch(`${API_BASE}/api/review-feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ModelFeedbackRecord>;
  } catch (e) {
    throw wrapFetchError(e);
  }
}

/** Match saved records for the same document text + span (for badges). */
export function feedbackForSpan(
  records: ModelFeedbackRecord[],
  text: string,
  start: number,
  end: number
): ModelFeedbackRecord | undefined {
  return records.find((r) => r.text === text && r.selectedSpan.start === start && r.selectedSpan.end === end);
}

export interface CheckpointComparisonRow {
  checkpoint_id: string;
  snapshot_name: string | null;
  model_family: string | null;
  best_val_loss: number | null;
  n_reviews: number;
  accept_rate: number;
  minor_edit_rate: number;
  reject_rate: number;
  major_severity_rate: number;
  avg_prom_delta: number | null;
  avg_spr_delta: number | null;
  avg_boundary_edit_count: number | null;
  feedback_score: number;
  validation_score: number;
  final_score_100: number;
}

export interface CheckpointComparisonReport {
  weights: { feedback: number; validation: number };
  formula: Record<string, string>;
  rows: CheckpointComparisonRow[];
}

export async function fetchCheckpointComparisonReport(
  checkpointIds: string[],
  minReviews = 1
): Promise<CheckpointComparisonReport> {
  const params = new URLSearchParams();
  if (checkpointIds.length > 0) params.set("checkpointIds", checkpointIds.join(","));
  params.set("minReviews", String(minReviews));
  try {
    const res = await fetch(`${API_BASE}/api/review-feedback/report?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<CheckpointComparisonReport>;
  } catch (e) {
    throw wrapFetchError(e);
  }
}
