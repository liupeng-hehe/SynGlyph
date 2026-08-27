"use client";

import { LetterGridTab } from "@/components/studio/LetterGridTab";
import { TextPdfTab } from "@/components/studio/TextPdfTab";
import { useStudio } from "@/lib/studioContext";

const tabs = [
  { id: "letters" as const, label: "Letter color cards" },
  { id: "textPdf" as const, label: "Text to color PDF" },
];

export function StudioShell() {
  const { state, dispatch } = useStudio();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="mb-10 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-byo-ink/70">
          Synesthetic Color Studio
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-byo-ink sm:text-5xl">
          Color-first letters & passage PDFs
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-byo-ink/70">
          Twenty-six immersive cards, local LAB naming, optional Color API refresh,
          and a rule-based synesthetic palette for printable passages—with LLM-ready
          hooks and saved palettes.
        </p>
        {state.byoHandoffName ? (
          <p className="mx-auto mt-4 max-w-xl rounded-full bg-byo-ink/10 px-4 py-2 text-xs font-medium text-byo-ink">
            Palette imported from Build Your Own — {state.byoHandoffName}. Export PNG or PDF below.
          </p>
        ) : null}
      </header>

      <div
        role="tablist"
        aria-label="Studio sections"
        className="mb-8 flex flex-wrap justify-center gap-2"
      >
        {tabs.map((t) => {
          const selected = state.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`tab-${t.id}`}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                selected
                  ? "bg-byo-ink text-white shadow-sm"
                  : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`tab-${state.tab}`}
        className="rounded-3xl border border-byo-ink/15 bg-white/75 p-6 shadow-xl backdrop-blur-sm sm:p-8"
      >
        {state.tab === "letters" ? <LetterGridTab /> : <TextPdfTab />}
      </div>
    </div>
  );
}
