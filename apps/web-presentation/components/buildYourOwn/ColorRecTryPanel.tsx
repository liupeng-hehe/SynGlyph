"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BYO_BG, BYO_INK } from "@/lib/colorStudio/byoTheme";
import {
  fetchColorRecHealth,
  retrieveColors,
  type ColorRecHealthResponse,
  type ColorRecHit,
} from "@/lib/buildYourOwn/colorrecRetrieve";

const SAMPLE_QUERIES = [
  "warm nostalgic jazz poster",
  "calm ocean morning light",
  "electric cyberpunk neon alley",
];

function normalizeHex(hex: string | undefined): string {
  if (!hex) return "#888888";
  const h = hex.startsWith("#") ? hex : `#${hex}`;
  return h.length >= 7 ? h.slice(0, 7) : "#888888";
}

export function ColorRecTryPanel() {
  const [health, setHealth] = useState<ColorRecHealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [query, setQuery] = useState(SAMPLE_QUERIES[0]);
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<ColorRecHit[]>([]);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setHealthError(null);
    try {
      const h = await fetchColorRecHealth();
      setHealth(h);
    } catch (e) {
      setHealth(null);
      setHealthError(e instanceof Error ? e.message : "Health check failed");
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function onRetrieve() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const out = await retrieveColors(q, topK);
      setResults(out.results ?? []);
      setModelPath(out.model_path ?? null);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "Retrieve failed");
    } finally {
      setLoading(false);
    }
  }

  const ready = health?.ready === true;

  return (
    <main
      className="min-h-[calc(100vh-4rem)] px-6 py-12"
      style={{ background: BYO_BG, color: BYO_INK }}
    >
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-wide opacity-60">
          <Link href="/build-your-own" className="underline underline-offset-2">
            ← Build Your Own
          </Link>
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">
          Color semantic retrieval
        </h1>
        <p className="mt-2 text-sm opacity-80">
          Live test for your HPC fine-tuned model via{" "}
          <code className="rounded bg-white/80 px-1.5 py-0.5 text-[11px]">POST /api/colorrec/retrieve</code>
        </p>

        <section
          className="mt-6 rounded-2xl border border-[#002FA7]/15 bg-[#FFFCF3]/95 p-5 shadow-sm"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide opacity-70">API</span>
            {healthError ? (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">
                unreachable — is FastAPI on :8000?
              </span>
            ) : ready ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">ready</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                not ready {health?.missing?.length ? `(${health.missing.join(", ")})` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadHealth()}
              className="ml-auto rounded-full border border-[#002FA7]/20 px-3 py-1 opacity-80 hover:bg-[#FFD447]/20"
            >
              Refresh health
            </button>
          </div>
          {health?.model_path ? (
            <p className="mt-2 break-all text-[10px] opacity-55">model: {health.model_path}</p>
          ) : null}
        </section>

        <section className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Text query
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#002FA7]/20 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#FFD447]/70"
              style={{ color: BYO_INK }}
              placeholder="Describe a mood, scene, or phrase…"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm opacity-80">
              Top K
              <input
                type="number"
                min={1}
                max={16}
                value={topK}
                onChange={(e) => setTopK(Math.min(16, Math.max(1, Number(e.target.value) || 5)))}
                className="ml-2 w-16 rounded-lg border border-[#002FA7]/20 bg-white px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void onRetrieve()}
              disabled={loading || !query.trim()}
              className="rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: BYO_INK }}
            >
              {loading ? "Retrieving…" : "Retrieve colors"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="rounded-full border border-[#002FA7]/20 px-3 py-1 text-xs opacity-75 hover:bg-[#FFD447]/15"
              >
                {s}
              </button>
            ))}
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </section>

        {results.length > 0 ? (
          <ul className="mt-8 space-y-3">
            {results.map((hit) => {
              const hex = normalizeHex(hit.hex);
              const label = hit.display_name ?? hit.name ?? "—";
              return (
                <li
                  key={`${hit.rank}-${hit.color_id ?? label}`}
                  className="flex gap-4 rounded-2xl border border-[#002FA7]/12 bg-white/90 p-4 shadow-sm"
                >
                  <div
                    className="h-16 w-16 shrink-0 rounded-xl border border-black/10 shadow-inner"
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-display text-lg font-semibold">{label}</span>
                      <span className="font-mono text-xs opacity-60">{hex}</span>
                      <span className="text-xs opacity-50">
                        score {(hit.score ?? 0).toFixed(3)} · {hit.family ?? "—"} · {hit.source ?? "—"}
                      </span>
                    </div>
                    {hit.explanation ? (
                      <p className="mt-1 text-sm opacity-80">{hit.explanation}</p>
                    ) : null}
                    {hit.descriptor ? (
                      <p className="mt-1 line-clamp-2 text-[11px] opacity-50">{hit.descriptor}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {modelPath ? (
          <p className="mt-6 break-all text-[10px] opacity-45">last retrieve model: {modelPath}</p>
        ) : null}
      </div>
    </main>
  );
}
