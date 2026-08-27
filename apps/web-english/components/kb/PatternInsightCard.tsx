"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  fetchKbSegments,
  fetchPatternPositions,
  fetchPatternTopWords,
  type KbSegmentItem,
  type PatternPositionsResponse,
  type PatternTopWordsResponse,
} from "@/lib/kbApi";
import { formatPatternResults } from "@/lib/kbFormatters";
import { KbExamplePreview } from "@/components/kb/KbExamplePreview";
import { RawJsonDrawer } from "@/components/kb/RawJsonDrawer";

type PanelStatus = "idle" | "loading" | "empty" | "error" | "success";

type PatternInsightCardProps = {
  vocabVersionId: string;
  patternKey: string;
  onPatternKeyChange: (key: string) => void;
};

export function PatternInsightCard({ vocabVersionId, patternKey, onPatternKeyChange }: PatternInsightCardProps) {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [topWordsRes, setTopWordsRes] = useState<PatternTopWordsResponse | null>(null);
  const [positionsRes, setPositionsRes] = useState<PatternPositionsResponse | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<KbSegmentItem[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vocabVersionId || !patternKey.trim()) {
      setStatus("idle");
      setErrorMessage("Select a vocab version and enter a pattern key.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    setCopyFeedback(null);
    setTopWordsRes(null);
    setPositionsRes(null);
    try {
      const [tw, pos] = await Promise.all([
        fetchPatternTopWords(vocabVersionId, patternKey.trim()),
        fetchPatternPositions(vocabVersionId, patternKey.trim()),
      ]);
      setTopWordsRes(tw);
      setPositionsRes(pos);
      if (!tw.top_words?.length) setStatus("empty");
      else setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }, [vocabVersionId, patternKey]);

  const formatted =
    topWordsRes && positionsRes ? formatPatternResults(topWordsRes, positionsRes) : null;

  const copyWords = async () => {
    if (!formatted?.rows.length) return;
    const text = formatted.rows.map((r) => r.word).join("\n");
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied.");
      window.setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed — select text manually or check permissions.");
    }
  };

  const openExamplesForWord = async (word: string) => {
    if (!vocabVersionId) return;
    setPreviewTitle(`Examples: ${word}`);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const { items } = await fetchKbSegments(vocabVersionId, { word, limit: 30 });
      setPreviewItems(items);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const rawPayload =
    topWordsRes && positionsRes ? { topWords: topWordsRes, positions: positionsRes } : null;

  return (
    <section
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm"
      aria-busy={status === "loading"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-medium text-zinc-100">Pattern insight</h2>
        {status === "success" && formatted && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs tabular-nums text-zinc-300">
            {formatted.rows.length} words
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        Inspect where a pattern shows up and jump into annotation for specific words.
      </p>

      <div className="mt-3 space-y-2">
        <label className="sr-only" htmlFor="kb-pattern-key">
          Pattern key
        </label>
        <input
          id="kb-pattern-key"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
          value={patternKey}
          onChange={(e) => onPatternKeyChange(e.target.value)}
          placeholder="ng2:he, ng4:ment, or char:a"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={load}
          disabled={!vocabVersionId || status === "loading"}
          className="rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {status === "loading" ? "Loading…" : "Load pattern"}
        </button>
      </div>

      <div className="mt-4 min-h-[4rem] text-sm">
        {status === "idle" && (
          <p className="text-zinc-500">
            {!vocabVersionId
              ? "Choose a vocab version above, then load a pattern."
              : "Enter a pattern key and load to see matched words and positions."}
          </p>
        )}
        {status === "loading" && <p className="text-zinc-400">Loading pattern data…</p>}
        {status === "error" && errorMessage && (
          <p className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-red-200/90">{errorMessage}</p>
        )}
        {status === "empty" && (
          <p className="text-zinc-500">No words matched this pattern in the top list (empty sample).</p>
        )}
        {status === "success" && formatted && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-zinc-200">
                Pattern &quot;{formatted.displayLiteral}&quot;
              </p>
              <p className="mt-1 text-zinc-400">{formatted.summaryLine}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatted.commonPositionsLine}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyWords}
                className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Copy words
              </button>
              {copyFeedback && <span className="text-xs text-zinc-500">{copyFeedback}</span>}
              <Link
                href="/active"
                className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Active learning queue
              </Link>
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Word
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium tabular-nums">
                      Hits
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Position
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {formatted.rows.map((row) => (
                    <tr key={row.word} className="hover:bg-zinc-950/40">
                      <td className="px-3 py-2 font-medium text-zinc-100">{row.word}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{row.hits}</td>
                      <td className="px-3 py-2 text-zinc-400">{row.positionLabel}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openExamplesForWord(row.word)}
                          className="text-xs text-sky-400/90 hover:underline"
                        >
                          Review examples
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <RawJsonDrawer value={rawPayload} />

      <KbExamplePreview
        open={previewOpen}
        title={previewTitle}
        loading={previewLoading}
        error={previewError}
        items={previewItems}
        onClose={() => setPreviewOpen(false)}
      />
    </section>
  );
}
