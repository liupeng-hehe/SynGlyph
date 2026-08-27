"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useExhibitionDebug } from "@/lib/exhibitionDebug";
import {
  predictText,
  type LetterSequencePrediction,
} from "@/lib/letterSequenceModel";

import { VIEWPOINT_PRESETS } from "./viewpointPresets";

/** WebGL must not execute during RSC/SSR — avoids webpack/runtime `reading 'call'` failures. */
const InstallationCanvas = dynamic(
  () => import("./InstallationCanvas").then((m) => m.InstallationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full pt-[2vh]" aria-hidden>
        <div className="relative h-[min(88vh,1080px)] min-h-[72vh] w-full bg-stone-200/25 sm:min-h-[76vh]" />
      </div>
    ),
  },
);

const DEFAULT_HERO_TEXT =
  process.env.NEXT_PUBLIC_HERO_TEXT?.trim() || "synesthesia";

function useRevealTimeline(): number {
  const [reveal01, setReveal01] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReveal01(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 7200;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      setReveal01(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return reveal01;
}

export function FoyerHero() {
  const [prediction, setPrediction] = useState<LetterSequencePrediction | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const reveal01 = useRevealTimeline();
  const debug = useExhibitionDebug();

  const snapshotId = useMemo(
    () => process.env.NEXT_PUBLIC_LETTER_SEQUENCE_SNAPSHOT_ID?.trim() || null,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await predictText(DEFAULT_HERO_TEXT, { snapshotId });
        if (!cancelled) {
          setPrediction(out);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setPrediction(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  return (
    <section className="relative overflow-hidden bg-foyer-paper">
      {/* Spatial wall text — background, but legible behind the mass */}
      <div
        className="pointer-events-none absolute inset-0 z-0 select-none"
        aria-hidden
      >
        <p
          className="absolute left-1/2 top-[4%] w-[135%] max-w-none -translate-x-1/2 font-display text-[clamp(3.25rem,14.5vw,11.5rem)] font-light uppercase leading-[0.9] tracking-[0.05em] text-stone-800/[0.09]"
        >
          When Words Turn Blue
        </p>
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-[1800px] flex-col items-center">
        <div className="relative w-full">
          <InstallationCanvas
            prediction={prediction}
            reveal01={reveal01}
            fallbackWord={DEFAULT_HERO_TEXT}
            debug={debug}
            viewIndex={viewIndex}
          />
        </div>

        {/* Museum label: tight under the mass (minimal gap) */}
        <div className="relative z-[1] mx-auto w-full max-w-xl px-6 pb-14 pt-0 text-center md:-mt-14 md:px-10">
          <h1 className="font-display text-[1.35rem] font-light leading-snug tracking-tight text-foyer-ink md:text-[1.5rem]">
            When Words Turn Blue
          </h1>
          <p className="mt-3 font-body text-[0.8125rem] leading-relaxed text-foyer-muted md:text-sm">
            Not all words remain black and white; some carry color before they are
            understood.
          </p>
          {prediction?.preprocessing &&
          (prediction.preprocessing.syllable_count > 0 ||
            (prediction.preprocessing.stress_pattern?.length ?? 0) > 0) ? (
            <p
              className="mt-2 font-mono text-[0.65rem] tracking-wide text-foyer-muted/80"
              aria-label="Syllable and stress prior from pronunciation pipeline"
            >
              Syllables {prediction.preprocessing.syllable_count}
              {prediction.preprocessing.stress_pattern
                ? ` · stress ${prediction.preprocessing.stress_pattern}`
                : ""}
            </p>
          ) : null}
          <p className="mt-6">
            <Link
              href="/reading"
              className="font-body text-sm text-foyer-ink underline decoration-stone-400/70 underline-offset-[5px] transition-colors hover:decoration-foyer-ink"
            >
              Enter the Reading →
            </Link>
          </p>
        </div>
      </div>

      {debug && loadError ? (
        <p className="relative z-[2] mx-auto max-w-lg px-6 pb-4 font-mono text-xs text-amber-900">
          [debug] API: {loadError}
        </p>
      ) : null}

      {debug ? (
        <div className="relative z-[2] mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-6 pb-10 md:px-10">
          <span className="font-mono text-[10px] uppercase tracking-wider text-foyer-muted">
            Viewpoints
          </span>
          {VIEWPOINT_PRESETS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewIndex(i)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foyer-accent/40 ${
                i === viewIndex
                  ? "border-foyer-ink bg-foyer-ink text-foyer-paper"
                  : "border-stone-300/90 bg-white/60 text-foyer-ink hover:border-stone-400"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="font-mono text-[10px] text-foyer-muted">
            Drag to orbit. Color resolves before letterforms.
          </span>
        </div>
      ) : null}
    </section>
  );
}
