import { getPublicApiUrl } from "./apiBase";

const API_BASE = getPublicApiUrl();

export interface MetricsSummary {
  latest_eval_mae_boundary: number | null;
  vs_previous_snapshot_pct: number | null;
  experiment_final_mae_random: number | null;
  experiment_final_mae_uncertainty: number | null;
  workflow: {
    window_start: string | null;
    window_end: string | null;
    accept_rate: number | null;
    reject_rate: number | null;
    minor_edit_rate: number | null;
    correction_magnitude_mean: number | null;
    mean_boundary_edits: number | null;
    n_feedback_rows: number | null;
  } | null;
  sentences: string[];
  facts_sample: Array<{
    subject_type: string;
    subject_id: string;
    metric_key: string;
    metric_value: number;
    comparison_kind: string;
    baseline_name: string;
    computed_at: string | null;
  }>;
}

export async function fetchMetricsSummary(): Promise<MetricsSummary> {
  const res = await fetch(`${API_BASE}/api/metrics/summary`, { cache: "no-store" });
  if (!res.ok) throw new Error(`metrics summary: ${res.status}`);
  return res.json();
}
