"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listStimuli, getAnnotatedStimulusIds } from "@/lib/api";
import type { Stimulus } from "@synglyph/shared";

export default function SeedReviewPage() {
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [annotatedIds, setAnnotatedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "annotated" | "unannotated">("all");

  useEffect(() => {
    Promise.all([listStimuli(500), getAnnotatedStimulusIds()]).then(([list, ids]) => {
      setStimuli(list);
      setAnnotatedIds(new Set(ids));
      setLoading(false);
    });
  }, []);

  const filtered = stimuli.filter((s) => {
    if (filter === "annotated") return annotatedIds.has(s.id);
    if (filter === "unannotated") return !annotatedIds.has(s.id);
    return true;
  });

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <div className="absolute left-4 top-4">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">← Home</Link>
      </div>
      <h1 className="text-2xl font-semibold text-white/90">Review annotations</h1>
      <p className="mt-2 text-sm text-white/60">Review and edit annotations for the seed set.</p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-4 py-2 text-sm ${filter === "all" ? "bg-sky-600 text-white" : "border border-white/30 text-white/90 hover:bg-white/10"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("annotated")}
          className={`rounded-full px-4 py-2 text-sm ${filter === "annotated" ? "bg-sky-600 text-white" : "border border-white/30 text-white/90 hover:bg-white/10"}`}
        >
          Annotated
        </button>
        <button
          onClick={() => setFilter("unannotated")}
          className={`rounded-full px-4 py-2 text-sm ${filter === "unannotated" ? "bg-sky-600 text-white" : "border border-white/30 text-white/90 hover:bg-white/10"}`}
        >
          Unannotated
        </button>
      </div>
      {loading ? (
        <p className="mt-4 text-white/60">Loading...</p>
      ) : (
        <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/annotate/${s.id}`}
              className={`rounded-xl border p-3 text-center text-sm transition hover:bg-white/10 ${annotatedIds.has(s.id) ? "border-green-500/50 bg-green-500/10 text-white/90" : "border-white/20 text-white/80"}`}
            >
              {s.text}
            </Link>
          ))}
        </div>
      )}
      <Link href="/active" className="mt-6 rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Next: Active learning →</Link>
    </div>
  );
}
