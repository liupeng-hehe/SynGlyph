"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  listSegmentMemory,
  refreshSegmentMemory,
  updateSegmentMemory,
  mergeSegmentMemory,
} from "@/lib/api";
import type { SegmentMemoryResponse } from "@synglyph/shared";
import { labToHex } from "@synglyph/shared";

export default function SeedSegmentsPage() {
  const [items, setItems] = useState<SegmentMemoryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [minCount, setMinCount] = useState(2);

  async function load() {
    setLoading(true);
    try {
      const list = await listSegmentMemory(minCount, 200);
      setItems(list);
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [minCount]);

  async function handleRefresh() {
    setRefreshing(true);
    setMessage("");
    try {
      const r = await refreshSegmentMemory();
      setMessage(`Mined ${r.mined} segments, ${r.total_occurrences} total occurrences`);
      await load();
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleReject(id: string) {
    try {
      await updateSegmentMemory(id, { rejected: true });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <div className="absolute left-4 top-4">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">← Home</Link>
      </div>
      <h1 className="text-2xl font-semibold text-white/90">Segment memory</h1>
      <p className="mt-2 text-sm text-white/60">Mine recurring segments from annotations, review, merge, or reject.</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-full bg-sky-600 px-8 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {refreshing ? "Mining..." : "Mine from annotations"}
        </button>
        <label className="flex items-center gap-2 text-white/80">
          Min count:
          <input
            type="number"
            min={1}
            value={minCount}
            onChange={(e) => setMinCount(parseInt(e.target.value, 10) || 1)}
            className="w-16 rounded-full border border-white/30 bg-white/5 px-3 py-1.5 text-white/90"
          />
        </label>
      </div>
      {message && <p className="mt-2 text-sm text-white/70">{message}</p>}
      {loading ? (
        <p className="mt-4 text-white/60">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/20 bg-[#1a1a24] shadow-2xl">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Segment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Count</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Prefix</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Middle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Suffix</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Color</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Prominence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Spread</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Examples</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((row) => {
                const hex = labToHex(row.avg_l, row.avg_a, row.avg_b);
                const examples = row.example_words ? (() => { try { return JSON.parse(row.example_words); } catch { return []; } })() : [];
                return (
                  <tr key={row.id} className="hover:bg-white/5">
                    <td className="px-4 py-2 font-mono text-sm text-white/90">{row.segment_text}</td>
                    <td className="px-4 py-2 text-white/80">{row.count}</td>
                    <td className="px-4 py-2 text-white/80">{row.prefix_count}</td>
                    <td className="px-4 py-2 text-white/80">{row.middle_count}</td>
                    <td className="px-4 py-2 text-white/80">{row.suffix_count}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block h-5 w-10 rounded border border-white/20" style={{ backgroundColor: `#${hex}` }} />
                    </td>
                    <td className="px-4 py-2 text-white/80">{row.avg_prominence.toFixed(2)}</td>
                    <td className="px-4 py-2 text-white/80">{row.avg_spread.toFixed(2)}</td>
                    <td className="px-4 py-2 text-xs text-white/60">{examples.slice(0, 3).join(", ")}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleReject(row.id)}
                        className="rounded-full border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Link href="/seed/review" className="mt-6 rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Next: Review →</Link>
    </div>
  );
}
