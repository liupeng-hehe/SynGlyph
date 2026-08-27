"use client";

import type { WordAnnotationReviewScore } from "@/lib/wordAnnotationReviewScore";

export function WordReviewScorePanel({ result }: { result: WordAnnotationReviewScore }) {
  const labelClass =
    result.label === "as_is"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : result.label === "minor_change"
        ? "bg-amber-100 text-amber-950 ring-amber-200"
        : "bg-rose-100 text-rose-900 ring-rose-200";

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[10px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-700">Review score</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">{result.score}</span>
        <span className="text-zinc-400">/ 100</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${labelClass}`}>{result.labelDisplay}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-zinc-600 sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Color Δ</dt>
          <dd className="font-mono text-zinc-800">
            −{result.colorPenalty}{" "}
            <span className="text-zinc-400">(mean OKLab d={result.meanOklabDistance.toFixed(4)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">P Δ</dt>
          <dd className="font-mono text-zinc-800">
            −{result.pPenalty} <span className="text-zinc-400">(mean |ΔP|={result.meanDeltaP.toFixed(3)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">S Δ</dt>
          <dd className="font-mono text-zinc-800">
            −{result.sPenalty} <span className="text-zinc-400">(mean |ΔS|={result.meanDeltaS.toFixed(3)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Transition Δ</dt>
          <dd className="font-mono text-zinc-800">
            −{result.transitionPenalty}{" "}
            <span className="text-zinc-400">(mean |ΔT|={result.meanDeltaT.toFixed(3)})</span>
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-[9px] leading-snug text-zinc-500">
        Score = 100 − color − P − S − transition (OKLab distance; T_pred = 0). Updates live as you edit.
      </p>
    </div>
  );
}
