"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  fetchCoverageGaps,
  fetchKbSegments,
  type CoverageGapsResponse,
  type KbSegmentItem,
} from "@/lib/kbApi";
import {
  isCoverageGapsWithGap,
  parseCoverageComboKey,
  rankSegmentComboUrgencies,
  toBucketTitle,
  toPatternGapUrgency,
} from "@/lib/kbFormatters";
import { parsePatternLiteral } from "@/lib/kbPatternMatch";
import { KbExamplePreview } from "@/components/kb/KbExamplePreview";
import { RawJsonDrawer } from "@/components/kb/RawJsonDrawer";

type PanelStatus = "idle" | "loading" | "empty" | "error" | "success";

type CoverageGapCardProps = {
  vocabVersionId: string;
  onApplyPatternKey: (patternKey: string) => void;
};

function unitTypeLabel(unitType: string): string {
  if (unitType === "char") return "Letter";
  if (unitType === "bigram" || unitType === "ngram_2") return "Bigram";
  if (unitType === "trigram" || unitType === "ngram_3") return "Trigram";
  const m = /^ngram_(\d+)$/.exec(unitType);
  if (m) return `${m[1]}-gram`;
  return unitType;
}

function urgencyBadgeClasses(tone: "zinc" | "amber" | "rose"): string {
  if (tone === "rose") return "border-rose-800/60 bg-rose-950/40 text-rose-200/90";
  if (tone === "amber") return "border-amber-800/50 bg-amber-950/30 text-amber-100/90";
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

export function CoverageGapCard({ vocabVersionId, onApplyPatternKey }: CoverageGapCardProps) {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<CoverageGapsResponse | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<KbSegmentItem[]>([]);

  const load = useCallback(async () => {
    if (!vocabVersionId) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    setData(null);
    try {
      const res = await fetchCoverageGaps(vocabVersionId);
      setData(res);
      if (!isCoverageGapsWithGap(res)) {
        setStatus("empty");
      } else {
        const hasRows =
          res.gap.under_covered_patterns.length > 0 || res.gap.segment_combos.length > 0;
        setStatus(hasRows ? "success" : "empty");
      }
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }, [vocabVersionId]);

  const openPatternExamples = async (patternKey: string) => {
    if (!vocabVersionId) return;
    setPreviewTitle(`Examples: ${patternKey}`);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const { items } = await fetchKbSegments(vocabVersionId, { pattern: patternKey, limit: 40 });
      setPreviewItems(items);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openComboExamples = async (comboKey: string) => {
    if (!vocabVersionId) return;
    const parsed = parseCoverageComboKey(comboKey);
    setPreviewTitle(parsed ? `Examples: ${toBucketTitle(parsed)}` : "Examples for bucket");
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const { items } = await fetchKbSegments(vocabVersionId, { pattern: comboKey, limit: 40 });
      setPreviewItems(items);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const gapPayload = data && isCoverageGapsWithGap(data) ? data.gap : null;
  const comboUrgency = gapPayload ? rankSegmentComboUrgencies(gapPayload.segment_combos) : null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm" aria-busy={status === "loading"}>
      <h2 className="text-lg font-medium text-zinc-100">Coverage gap snapshot</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Annotation coverage vs internal pattern targets and segment buckets. Lexicon size (orthographic prior corpus) is
        reported separately when present — it is not labeled supervision coverage.
      </p>

      <button
        type="button"
        onClick={load}
        disabled={!vocabVersionId || status === "loading"}
        className="mt-3 rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {status === "loading" ? "Loading…" : "Load gap snapshot"}
      </button>

      <div className="mt-4 min-h-[4rem] text-sm">
        {status === "idle" && (
          <p className="text-zinc-500">Load to see under-covered patterns and labeled segment buckets.</p>
        )}
        {status === "loading" && <p className="text-zinc-400">Loading coverage snapshot…</p>}
        {status === "error" && errorMessage && (
          <p className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-red-200/90">{errorMessage}</p>
        )}
        {status === "empty" && data && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-zinc-400">
            {!isCoverageGapsWithGap(data) ? (
              <>
                <p className="font-medium text-zinc-300">No snapshot yet</p>
                {"detail" in data && data.detail && (
                  <p className="mt-2 text-xs text-zinc-500">{data.detail}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                Snapshot loaded, but there are no pattern or segment bucket rows to show. Rebuild the KB after adding
                labels to refresh analytics.
              </p>
            )}
          </div>
        )}
        {status === "success" && gapPayload && comboUrgency && (
          <div className="space-y-8">
            {data && isCoverageGapsWithGap(data) && data.computed_at && (
              <p className="text-xs text-zinc-500">Computed at {data.computed_at}</p>
            )}

            {gapPayload.kb_lexicon && (
              <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3 text-xs text-sky-100/85">
                <span className="font-medium text-sky-100">KB lexicon (prior corpus)</span>
                <span className="mx-1.5 text-sky-200/60">·</span>
                <span className="tabular-nums">{gapPayload.kb_lexicon.word_count}</span> words in this snapshot.
                <p className="mt-1 text-sky-200/80">{gapPayload.kb_lexicon.note}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Pattern gaps</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Patterns that still need labeled examples to reach internal targets.
              </p>
              {gapPayload.under_covered_patterns.length === 0 && (
                <p className="mt-2 text-sm text-zinc-500">No pattern-level gaps in this snapshot.</p>
              )}
              {gapPayload.under_covered_patterns.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-950/50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Pattern
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium tabular-nums">
                        Labeled
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium tabular-nums">
                        Target
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Urgency
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {gapPayload.under_covered_patterns.map((row) => {
                      const u = toPatternGapUrgency(row);
                      const lit = parsePatternLiteral(row.pattern_key, row.unit_type) ?? row.pattern_key;
                      return (
                        <tr key={row.pattern_id} className="hover:bg-zinc-950/40">
                          <td className="px-3 py-2">
                            <span className="font-mono text-zinc-100">{lit}</span>
                            <span className="ml-2 text-xs text-zinc-600">{unitTypeLabel(row.unit_type)}</span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-zinc-300">{row.count_labeled}</td>
                          <td className="px-3 py-2 tabular-nums text-zinc-400">{row.target}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-xs ${urgencyBadgeClasses(u.tone)}`}
                            >
                              {u.badge}
                            </span>
                            <p className="mt-1 max-w-xs text-xs text-zinc-500">{u.description}</p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                onClick={() => onApplyPatternKey(row.pattern_key)}
                                className="text-left text-xs text-sky-400/90 hover:underline"
                              >
                                Load in pattern panel
                              </button>
                              <button
                                type="button"
                                onClick={() => openPatternExamples(row.pattern_key)}
                                className="text-left text-xs text-sky-400/90 hover:underline"
                              >
                                Review examples
                              </button>
                              <Link href="/active" className="text-xs text-sky-400/90 hover:underline">
                                Send to annotation queue
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Segment buckets</h3>
              <p className="mt-1 text-xs text-zinc-500">
                How many labeled words fall into each length / segment / label slice. Low-ranked buckets have fewer
                labeled examples than peers in this snapshot.
              </p>
              {gapPayload.segment_combos.length === 0 && (
                <p className="mt-2 text-sm text-zinc-500">No segment bucket rows in this snapshot.</p>
              )}
              {gapPayload.segment_combos.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-950/50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Bucket
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium tabular-nums">
                        Labeled count
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {gapPayload.segment_combos.map((row) => {
                      const parsed = parseCoverageComboKey(row.combo_key);
                      const title = parsed ? toBucketTitle(parsed) : row.combo_key;
                      const u = comboUrgency.get(row.combo_key) ?? {
                        badge: "—",
                        description: "",
                        tone: "zinc" as const,
                      };
                      return (
                        <tr key={row.combo_key} className="hover:bg-zinc-950/40">
                          <td className="px-3 py-2 text-zinc-200">{title}</td>
                          <td className="px-3 py-2 tabular-nums text-zinc-300">{row.count_labeled}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-xs ${urgencyBadgeClasses(u.tone)}`}
                            >
                              {u.badge}
                            </span>
                            <p className="mt-1 max-w-xs text-xs text-zinc-500">{u.description}</p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                onClick={() => openComboExamples(row.combo_key)}
                                className="text-left text-xs text-sky-400/90 hover:underline"
                              >
                                Review examples
                              </button>
                              <Link href="/active" className="text-xs text-sky-400/90 hover:underline">
                                Open annotation queue
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </div>
        )}
      </div>

      <RawJsonDrawer value={data} />
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
