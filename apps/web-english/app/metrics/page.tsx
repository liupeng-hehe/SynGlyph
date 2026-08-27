"use client";

import { useEffect, useState } from "react";
import { fetchMetricsSummary, type MetricsSummary } from "@/lib/metricsApi";

export default function MetricsPage() {
  const [data, setData] = useState<MetricsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchMetricsSummary()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">HITL metrics</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Populated by <code className="text-zinc-300">python scripts/rollup_metrics.py</code> from
        eval runs, review feedback, and <code className="text-zinc-300">artifacts/experiments/*/final_summary.json</code>.
      </p>

      {err && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-red-200 text-sm mb-6">
          {err}
        </div>
      )}

      {!data && !err && <p className="text-zinc-500">Loading…</p>}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium text-zinc-200 mb-3">Summary</h2>
            <ul className="space-y-2">
              {data.sentences.map((s, i) => (
                <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Latest val MAE (boundary)</div>
              <div className="text-xl font-mono">
                {data.latest_eval_mae_boundary != null
                  ? data.latest_eval_mae_boundary.toFixed(4)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">vs previous checkpoint</div>
              <div className="text-xl font-mono">
                {data.vs_previous_snapshot_pct != null
                  ? `${data.vs_previous_snapshot_pct >= 0 ? "+" : ""}${data.vs_previous_snapshot_pct.toFixed(1)}% error reduction`
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Experiment final MAE (random)</div>
              <div className="text-xl font-mono">
                {data.experiment_final_mae_random != null
                  ? data.experiment_final_mae_random.toFixed(4)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Experiment final MAE (uncertainty)</div>
              <div className="text-xl font-mono">
                {data.experiment_final_mae_uncertainty != null
                  ? data.experiment_final_mae_uncertainty.toFixed(4)
                  : "—"}
              </div>
            </div>
          </section>

          {data.workflow && (
            <section>
              <h2 className="text-lg font-medium text-zinc-200 mb-3">Review window</h2>
              <div className="rounded-lg border border-zinc-800 p-4 text-sm font-mono text-zinc-300">
                <div>accept_rate: {data.workflow.accept_rate?.toFixed(3) ?? "—"}</div>
                <div>minor_edit_rate: {data.workflow.minor_edit_rate?.toFixed(3) ?? "—"}</div>
                <div>reject_rate: {data.workflow.reject_rate?.toFixed(3) ?? "—"}</div>
                <div>n_feedback_rows: {data.workflow.n_feedback_rows ?? "—"}</div>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-medium text-zinc-200 mb-3">Recent metric facts</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 text-zinc-500">
                  <tr>
                    <th className="p-2">subject</th>
                    <th className="p-2">metric</th>
                    <th className="p-2">value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.facts_sample.slice(0, 12).map((f, i) => (
                    <tr key={i} className="border-t border-zinc-800">
                      <td className="p-2 text-zinc-400">{f.subject_type}</td>
                      <td className="p-2">{f.metric_key}</td>
                      <td className="p-2">{f.metric_value.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
