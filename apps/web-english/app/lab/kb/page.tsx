"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CoverageGapCard } from "@/components/kb/CoverageGapCard";
import { NeighborInsightCard } from "@/components/kb/NeighborInsightCard";
import { PatternInsightCard } from "@/components/kb/PatternInsightCard";
import { getPublicApiUrl } from "@/lib/apiBase";
import {
  fetchKbVersions,
  fetchPatternList,
  rebuildKb,
  deleteKbVersion,
  setKbVersionActive,
  recomputePatterns,
  fetchTopWordsByPatternCount,
  fetchWeightedCoverage,
  type KbVersion,
  type PatternListItem,
  type TopWordByPatternItem,
  type TopWordsByPatternResponse,
  type WeightedCoverageResponse,
  type RebuildMode,
} from "@/lib/kbApi";

// Well-known important English 4-grams (static fallback when DB has no ngram_4)
const STATIC_NG4: { pattern_key: string; corpus_freq: number }[] = [
  { pattern_key: "tion", corpus_freq: 9800 },
  { pattern_key: "ment", corpus_freq: 7200 },
  { pattern_key: "ness", corpus_freq: 5900 },
  { pattern_key: "ight", corpus_freq: 5100 },
  { pattern_key: "ough", corpus_freq: 4700 },
  { pattern_key: "ound", corpus_freq: 4600 },
  { pattern_key: "ling", corpus_freq: 4500 },
  { pattern_key: "ring", corpus_freq: 4400 },
  { pattern_key: "ting", corpus_freq: 4200 },
  { pattern_key: "ding", corpus_freq: 4100 },
  { pattern_key: "ally", corpus_freq: 3900 },
  { pattern_key: "ical", corpus_freq: 3700 },
  { pattern_key: "ious", corpus_freq: 3600 },
  { pattern_key: "able", corpus_freq: 3500 },
  { pattern_key: "ness", corpus_freq: 3400 },
  { pattern_key: "over", corpus_freq: 3300 },
  { pattern_key: "ence", corpus_freq: 3200 },
  { pattern_key: "ance", corpus_freq: 3100 },
  { pattern_key: "less", corpus_freq: 3000 },
  { pattern_key: "ster", corpus_freq: 2900 },
  { pattern_key: "ther", corpus_freq: 2800 },
  { pattern_key: "ight", corpus_freq: 2700 },
  { pattern_key: "ward", corpus_freq: 2600 },
  { pattern_key: "ness", corpus_freq: 2500 },
  { pattern_key: "ship", corpus_freq: 2400 },
  { pattern_key: "ther", corpus_freq: 2300 },
  { pattern_key: "ness", corpus_freq: 2200 },
  { pattern_key: "ound", corpus_freq: 2100 },
  { pattern_key: "ness", corpus_freq: 2000 },
  { pattern_key: "tion", corpus_freq: 1900 },
].filter((x, i, arr) => arr.findIndex(y => y.pattern_key === x.pattern_key) === i); // dedupe

function underlinePatterns(word: string, patterns: string[]): React.ReactNode[] {
  // Mark which char positions are covered by a pattern (longest first)
  const covered = new Array<string | null>(word.length).fill(null);
  for (const p of patterns) {
    let idx = 0;
    while (idx <= word.length - p.length) {
      const pos = word.indexOf(p, idx);
      if (pos === -1) break;
      if (covered.slice(pos, pos + p.length).every((v) => v === null)) {
        for (let j = 0; j < p.length; j++) covered[pos + j] = p;
      }
      idx = pos + 1;
    }
  }

  // Build spans: consecutive chars with the same pattern get one underlined span
  const spans: React.ReactNode[] = [];
  let i = 0;
  while (i < word.length) {
    const pat = covered[i];
    if (pat) {
      let j = i;
      while (j < word.length && covered[j] === pat) j++;
      spans.push(
        <span key={i} title={pat} style={{ textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "#34d399", cursor: "help" }}>
          {word.slice(i, j)}
        </span>
      );
      i = j;
    } else {
      spans.push(<span key={i}>{word[i]}</span>);
      i++;
    }
  }
  return spans;
}

function WeightedCoverageBar({ vid }: { vid: string }) {
  const [data, setData] = useState<WeightedCoverageResponse | null>(null);

  useEffect(() => {
    if (!vid) return;
    fetchWeightedCoverage(vid)
      .then(setData)
      .catch(() => null);
  }, [vid]);

  if (!data || data.total_weight === 0) return null;

  const pct = Math.round(data.coverage_pct * 100 * 10) / 10;
  const labeledK = (data.labeled_weight / 1000).toFixed(1);
  const totalK = (data.total_weight / 1000).toFixed(1);

  return (
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">加权覆盖率 <span className="text-zinc-600">（已标注 pattern 的 corpus_freq 之和 / 总和）</span></span>
        <span className="tabular-nums text-emerald-400 font-semibold">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-zinc-600">
        <span>已覆盖 {data.labeled_patterns} / {data.total_patterns} 个 pattern</span>
        <span>影响力 {labeledK}k / {totalK}k</span>
      </div>
    </div>
  );
}

function TopWordsPanel({ vid }: { vid: string }) {
  const [data, setData] = useState<TopWordsByPatternResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vid) return;
    setData(null);
    setErr(null);
    fetchTopWordsByPatternCount(vid, 30, 20, 15)
      .then((d) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [vid]);

  if (err) return <p className="p-4 text-sm text-red-400">{err}</p>;
  if (!data) return <p className="p-4 text-sm text-zinc-500">Loading…</p>;
  if (data.items.length === 0) return <p className="p-4 text-sm text-zinc-500">No data — recompute patterns first.</p>;

  const cumulative = data.items.reduce((acc, item) => acc + item.new_patterns, 0);
  const coveredWeightPct = data.total_weight > 0
    ? Math.round((data.covered_weight / data.total_weight) * 100)
    : 0;

  return (
    <div>
      {/* 两条进度条：pattern 数量覆盖 + 加权影响力覆盖 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-zinc-400">Pattern 覆盖（30词）</span>
            <span className="font-semibold text-emerald-400">
              {Math.round((cumulative / data.total_eligible_patterns) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((cumulative / data.total_eligible_patterns) * 100, 100)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">{cumulative} / {data.total_eligible_patterns} 个独特 n-gram</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-zinc-400">影响力覆盖（30词）</span>
            <span className="font-semibold text-violet-400">{coveredWeightPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(coveredWeightPct, 100)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            影响力 {(data.covered_weight / 1000).toFixed(1)}k / {(data.total_weight / 1000).toFixed(1)}k
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-x-4 gap-y-2">
        {data.items.map((item, i) => (
          <div key={item.word} className="flex gap-2 py-1">
            <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-zinc-600">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-medium text-zinc-100">
                  {underlinePatterns(item.word, item.pattern_strings)}
                </span>
                <span className="text-[10px] tabular-nums text-emerald-400">+{item.new_patterns}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {item.pattern_strings.map((p, pi) => {
                  const freq = item.pattern_freqs?.[pi] ?? 0;
                  return (
                    <span
                      key={p}
                      title={`corpus_freq: ${freq}`}
                      className="rounded bg-zinc-800 px-1 py-px font-mono text-[9px] text-emerald-400"
                    >
                      {p}
                      {freq > 0 && (
                        <span className="ml-0.5 text-zinc-500">×{freq}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type NgramTab = "ngram_2" | "ngram_3" | "ngram_4";

function NgramPanel({ vid, tab }: { vid: string; tab: NgramTab }) {
  const [items, setItems] = useState<PatternListItem[] | null>(null);
  const [isStatic, setIsStatic] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vid) return;
    setItems(null);
    setErr(null);
    setIsStatic(false);
    if (tab === "ngram_4") {
      fetchPatternList(vid, "ngram_4", 100)
        .then((d) => {
          if (d.items.length > 0) {
            setItems(d.items);
          } else {
            setItems(STATIC_NG4.map((x, i) => ({ id: String(i), ...x })));
            setIsStatic(true);
          }
        })
        .catch(() => {
          setItems(STATIC_NG4.map((x, i) => ({ id: String(i), ...x })));
          setIsStatic(true);
        });
    } else {
      fetchPatternList(vid, tab, 200)
        .then((d) => setItems(d.items))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }
  }, [vid, tab]);

  const MIN_FREQ = 20;
  const filtered = items ? items.filter((x) => x.corpus_freq >= MIN_FREQ) : null;
  const maxFreq = filtered && filtered.length > 0 ? filtered[0].corpus_freq : 1;

  if (err) return <p className="p-4 text-sm text-red-400">{err}</p>;
  if (!items) return <p className="p-4 text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      {isStatic && (
        <p className="mb-3 rounded border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          No ngram_4 data in DB — showing curated static list. Rebuild KB with 4-gram support to get live data.
        </p>
      )}
      {filtered && filtered.length === 0 && (
        <p className="p-4 text-sm text-zinc-500">No patterns with freq ≥ {MIN_FREQ} in this version.</p>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {(filtered ?? []).map((item, i) => {
          const pct = Math.max(4, Math.round((item.corpus_freq / maxFreq) * 100));
          return (
            <div key={item.id} className="flex items-center gap-2 py-0.5">
              <span className="w-5 text-right text-xs text-zinc-600">{i + 1}</span>
              <span className="w-14 font-mono text-sm font-medium text-zinc-100">
                {item.pattern_key.replace(/^ng[234]:/, "")}
              </span>
              <div className="flex flex-1 items-center gap-1">
                <div className="h-1.5 rounded-full bg-violet-500/70" style={{ width: `${pct}%` }} />
                <span className="text-[10px] text-zinc-500">{item.corpus_freq.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function KbExplorerPage() {
  const [versions, setVersions] = useState<KbVersion[]>([]);
  const [vid, setVid] = useState<string>("");
  const [patternKey, setPatternKey] = useState("ng2:he");
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [ngramTab, setNgramTab] = useState<NgramTab>("ngram_2");
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ngramKey, setNgramKey] = useState(0);

  // Vocab management
  const [buildLabel, setBuildLabel] = useState("");
  const [buildMode, setBuildMode] = useState<RebuildMode>("builtin_wordfreq");
  const [buildWordCount, setBuildWordCount] = useState(5000);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deletingVid, setDeletingVid] = useState<string | null>(null);
  const [settingActiveVid, setSettingActiveVid] = useState<string | null>(null);

  const reloadVersions = useCallback(() => {
    setVersionsError(null);
    setVersionsLoading(true);
    fetchKbVersions()
      .then((d) => {
        setVersions(d.items);
        const active = d.items.find((x) => x.is_active);
        if (active) setVid(active.id);
        else if (d.items[0]) setVid(d.items[0].id);
        else setVid("");
      })
      .catch((e) => {
        setVersions([]);
        setVid("");
        setVersionsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setVersionsLoading(false));
  }, []);

  useEffect(() => {
    reloadVersions();
  }, [reloadVersions]);

  const apiBase = useMemo(() => getPublicApiUrl(), []);

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-zinc-50">Knowledge base workbench</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Explore English orthographic prior patterns, letter neighbors, and analytics. The KB is built from a
          lexicon snapshot (file, wordfreq, cached API JSON, stimuli, or build-time Random Word + Datamuse hybrid) — not
          ground truth. Datamuse has daily request limits; do not rely on it at page-render time. Rebuild via{" "}
          <code className="text-zinc-300">POST {apiBase}/api/kb/catalog/rebuild</code> (see{" "}
          <code className="text-zinc-300">mode</code>: stimuli, lexicon_text, lexicon_file, online_hybrid, …) or{" "}
          <code className="text-zinc-300">python scripts/rebuild_kb_vocab.py</code>. Coverage panels separate lexicon
          size from labeled annotation gaps.
        </p>

        {versionsError && (
          <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            <p>{versionsError}</p>
            <p className="mt-2 text-xs text-red-200/70">
              Check that the API is running and <code className="text-red-100/90">NEXT_PUBLIC_API_URL</code> points to
              it, then retry.
            </p>
            <button
              type="button"
              onClick={reloadVersions}
              className="mt-3 rounded border border-red-400/40 bg-red-900/30 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900/50"
            >
              Retry load versions
            </button>
          </div>
        )}

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500" htmlFor="kb-vocab-version">
            Vocab version
          </label>
          <select
            id="kb-vocab-version"
            className="mt-2 w-full max-w-xl rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            value={vid}
            onChange={(e) => setVid(e.target.value)}
            disabled={versionsLoading || (versions.length === 0 && !versionsError)}
          >
            {versionsLoading && versions.length === 0 && !versionsError && (
              <option value="">Loading versions…</option>
            )}
            {!versionsLoading && versions.length === 0 && (
              <option value="">No vocab versions — rebuild KB or fix API</option>
            )}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — {v.word_count} words
                {v.source_kind ? ` [${v.source_kind}]` : ""}
                {v.is_active ? " (active)" : ""}
              </option>
            ))}
          </select>
        </section>

        {/* Vocab version management */}
        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">词表管理</h2>

          {/* Build new vocab */}
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-200">新建词表</h3>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="词表名称（如 kb_6500_v2）"
                value={buildLabel}
                onChange={(e) => setBuildLabel(e.target.value)}
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                style={{ minWidth: 200 }}
              />
              <select
                value={buildMode}
                onChange={(e) => setBuildMode(e.target.value as RebuildMode)}
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none"
              >
                <option value="builtin_wordfreq">内置词频表（wordfreq，推荐，速度快）</option>
                <option value="online_hybrid">外部 API —— Datamuse 字母表扫描（a*~z*，支持大词表）</option>
                <option value="stimuli">当前标注词（stimuli）</option>
              </select>
              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-400">词数</label>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  step={500}
                  value={buildWordCount}
                  onChange={(e) => setBuildWordCount(Number(e.target.value))}
                  className="w-24 rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <button
                type="button"
                disabled={building || !buildLabel.trim()}
                onClick={async () => {
                  setBuilding(true);
                  setBuildMsg(null);
                  try {
                    const res = await rebuildKb({
                      label: buildLabel.trim(),
                      mode: buildMode,
                      set_active: true,
                      builtin_wordfreq_limit: buildMode === "builtin_wordfreq" ? buildWordCount : undefined,
                      max_words: buildMode === "stimuli" ? buildWordCount : undefined,
                      online_hybrid: buildMode === "online_hybrid" ? { target_words: buildWordCount } : undefined,
                    });
                    setBuildMsg({ ok: true, text: `完成！版本 ID: ${res.vocab_version_id}` });
                    setBuildLabel("");
                    reloadVersions();
                  } catch (e) {
                    setBuildMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
                  } finally {
                    setBuilding(false);
                  }
                }}
                className="rounded bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {building ? "构建中…" : "新建"}
              </button>
            </div>
            {buildMsg && (
              <p className={`mt-2 text-xs ${buildMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{buildMsg.text}</p>
            )}
          </div>

          {/* Version list */}
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  v.is_active ? "border-violet-600/50 bg-violet-950/30" : "border-zinc-700 bg-zinc-800/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  {v.is_active && (
                    <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">ACTIVE</span>
                  )}
                  <span className="text-sm font-medium text-zinc-100">{v.label}</span>
                  <span className="text-xs text-zinc-500">
                    {v.word_count.toLocaleString()} 词
                    {v.source_kind ? ` · ${v.source_kind}` : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  {!v.is_active && (
                    <button
                      type="button"
                      disabled={settingActiveVid === v.id}
                      onClick={async () => {
                        setSettingActiveVid(v.id);
                        try {
                          await setKbVersionActive(v.id);
                          reloadVersions();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : String(e));
                        } finally {
                          setSettingActiveVid(null);
                        }
                      }}
                      className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:border-violet-500 hover:text-violet-300 disabled:opacity-50"
                    >
                      {settingActiveVid === v.id ? "…" : "设为 active"}
                    </button>
                  )}
                  {!v.is_active && (
                    <button
                      type="button"
                      disabled={deletingVid === v.id}
                      onClick={async () => {
                        if (!confirm(`删除词表 "${v.label}"？此操作不可撤销。`)) return;
                        setDeletingVid(v.id);
                        try {
                          await deleteKbVersion(v.id);
                          reloadVersions();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : String(e));
                        } finally {
                          setDeletingVid(null);
                        }
                      }}
                      className="rounded border border-red-800/50 px-2 py-1 text-xs text-red-400 hover:border-red-500 hover:bg-red-950/30 disabled:opacity-50"
                    >
                      {deletingVid === v.id ? "…" : "删除"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* N-gram frequency table */}
        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Top n-grams by corpus frequency</h2>
            <div className="flex items-center gap-2">
              {recomputeMsg && (
                <span className={`text-xs ${recomputeMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {recomputeMsg.text}
                </span>
              )}
              <button
                type="button"
                disabled={!vid || recomputing}
                onClick={async () => {
                  setRecomputing(true);
                  setRecomputeMsg(null);
                  try {
                    const res = await recomputePatterns(vid);
                    setRecomputeMsg({ ok: true, text: `完成：${res.words} 词 · ${res.patterns} patterns` });
                    setNgramKey((k) => k + 1);
                  } catch (e) {
                    setRecomputeMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
                  } finally {
                    setRecomputing(false);
                  }
                }}
                className="rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:border-violet-500 hover:text-violet-300 disabled:opacity-40"
              >
                {recomputing ? "计算中…" : "重新计算统计"}
              </button>
            </div>
          </div>
          <div className="mb-4 flex gap-2">
            {(["ngram_2", "ngram_3", "ngram_4"] as NgramTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNgramTab(t)}
                className={`rounded px-3 py-1 text-sm font-medium transition ${
                  ngramTab === t
                    ? "bg-violet-600 text-white"
                    : "border border-zinc-700 text-zinc-400 hover:border-violet-500 hover:text-violet-300"
                }`}
              >
                {t === "ngram_2" ? "Bigrams (ng2)" : t === "ngram_3" ? "Trigrams (ng3)" : "4-grams (ng4)"}
              </button>
            ))}
          </div>
          {vid ? <NgramPanel key={`${vid}-${ngramTab}-${ngramKey}`} vid={vid} tab={ngramTab} /> : <p className="text-sm text-zinc-500">Select a vocab version above.</p>}
        </section>

        {/* Top words by n-gram coverage */}
        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Top 30 词 — 最多 n-gram 组合数（freq ≥ 20）
          </h2>
          {vid ? (
            <>
              <WeightedCoverageBar key={`wc-${vid}`} vid={vid} />
              <TopWordsPanel key={`${vid}-${ngramKey}`} vid={vid} />
            </>
          ) : <p className="text-sm text-zinc-500">Select a vocab version above.</p>}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <PatternInsightCard vocabVersionId={vid} patternKey={patternKey} onPatternKeyChange={setPatternKey} />
          <NeighborInsightCard vocabVersionId={vid} />
        </section>

        <section className="mt-8">
          <CoverageGapCard vocabVersionId={vid} onApplyPatternKey={setPatternKey} />
        </section>
      </div>
    </div>
  );
}
