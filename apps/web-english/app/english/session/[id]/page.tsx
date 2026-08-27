"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createEnglishSession, getEnglishSession } from "@/lib/apiEnglish";
import { labToHex } from "@synglyph/shared";

type LabColor = { space: "lab"; value: [number, number, number] };
type AnyColor = LabColor | { space: string; value: unknown };

type Segment = {
  id: string;
  sort_order: number;
  label: string | null;
  color_json: AnyColor;
};

type Transition = {
  id: string;
  source_segment_id: string;
  target_segment_id: string;
  strength: number;
  blend_mode: string | null;
};

type WordInstance = {
  id: string;
  word_text: string;
  segments: Segment[];
  transitions: Transition[];
};

type SessionData = {
  id: string;
  created_at: string | null;
  word_instances: WordInstance[];
};

function resolveHex(color: AnyColor): string {
  if (color.space === "lab" && Array.isArray(color.value) && color.value.length === 3) {
    const [L, a, b] = color.value as [number, number, number];
    return labToHex(L, a, b);
  }
  return "888888";
}

function WordCard({ instance }: { instance: WordInstance }) {
  const sorted = [...instance.segments].sort((a, b) => a.sort_order - b.sort_order);
  const word = instance.word_text;

  // Divide word characters evenly across segments for colour rendering
  const charColors: string[] = Array(word.length).fill("888888");
  if (sorted.length > 0) {
    const chunkSize = Math.ceil(word.length / sorted.length);
    sorted.forEach((seg, i) => {
      const hex = resolveHex(seg.color_json);
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, word.length);
      for (let j = start; j < end; j++) charColors[j] = hex;
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      {/* Word rendering */}
      <div className="mb-5 flex flex-wrap items-baseline gap-0" style={{ fontSize: "clamp(2rem, 8vw, 4rem)", fontWeight: 700, lineHeight: 1.1 }}>
        {word.split("").map((ch, i) => {
          const hex = `#${charColors[i]}`;
          return (
            <span
              key={i}
              style={{
                color: hex,
                textShadow: `0 0 20px ${hex}88`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>

      {/* Segment swatches */}
      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {sorted.map((seg) => {
            const hex = `#${resolveHex(seg.color_json)}`;
            return (
              <div key={seg.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-5 w-5 rounded-full border border-zinc-200 shadow-sm"
                  style={{ background: hex, boxShadow: `0 0 8px ${hex}66` }}
                />
                <span className="text-xs text-zinc-500">
                  {seg.label ?? `seg ${seg.sort_order}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Transitions */}
      {instance.transitions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {instance.transitions.map((tr) => {
            const src = sorted.find((s) => s.id === tr.source_segment_id);
            const tgt = sorted.find((s) => s.id === tr.target_segment_id);
            if (!src || !tgt) return null;
            const srcHex = `#${resolveHex(src.color_json)}`;
            const tgtHex = `#${resolveHex(tgt.color_json)}`;
            return (
              <div key={tr.id} className="flex items-center gap-1 rounded-full border border-zinc-100 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: srcHex }} />
                <span>→</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: tgtHex }} />
                <span className="ml-1 tabular-nums">{tr.strength.toFixed(2)}</span>
                {tr.blend_mode && <span className="text-zinc-400">{tr.blend_mode}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EnglishSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<SessionData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (id === "new") {
      createEnglishSession("hello")
        .then((s: { id: string }) => router.replace(`/english/session/${s.id}`))
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
      return;
    }
    getEnglishSession(id)
      .then((d: SessionData) => setData(d))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id, router]);

  if (id === "new") return <p className="p-8 text-zinc-400">Creating session…</p>;

  if (err) {
    return (
      <main className="p-8">
        <p className="text-amber-600">{err}</p>
        <Link href="/english" className="mt-4 inline-block text-sky-500 hover:underline">← Back</Link>
      </main>
    );
  }

  if (!data) return <p className="p-8 text-zinc-400">Loading…</p>;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-800">English session</h1>
          <Link href="/english" className="text-sm text-sky-500 hover:underline">← Back</Link>
        </div>

        {data.word_instances.length === 0 ? (
          <p className="text-sm text-zinc-400">No words in this session yet.</p>
        ) : (
          <div className="space-y-4">
            {data.word_instances.map((wi) => (
              <WordCard key={wi.id} instance={wi} />
            ))}
          </div>
        )}

        <details className="mt-8">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600">Raw JSON</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-[10px] text-zinc-500">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
