"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  listDatasets,
  listStimuli,
  getAnnotatedSummary,
  getCountSummary,
  getRawExport,
  deleteStimulus,
  deleteDataset,
  bulkImportStimuli,
  createDataset,
} from "@/lib/api";
import {
  getAnnotatorAlphabetSource,
  getUserRole,
  setUserRole,
} from "@/lib/annotator";
import type { Stimulus } from "@synglyph/shared";

// Slot machine: roll one word at a time instead of 6×6 grid

function hexWithHash(hex: string) {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function NotebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function HomePage() {
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [rolledWord, setRolledWord] = useState<Stimulus | null>(null);
  const [annotatedColors, setAnnotatedColors] = useState<Record<string, string>>({});
  const [countSummary, setCountSummary] = useState<{ total: number; annotated: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMigrateFromId, setCreateMigrateFromId] = useState<string>("");
  const [userRole, setUserRoleState] = useState<"default" | "admin">("default");
  const [rawModalOpen, setRawModalOpen] = useState(false);
  const [rawData, setRawData] = useState<string>("");
  const [showAllWords, setShowAllWords] = useState(false);
  const [isTearing, setIsTearing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const tearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ y: number; clientY: number } | null>(null);

  const effectiveOwner = userRole === "admin" ? "admin" : "default";

  async function loadDatasets() {
    try {
      const dsList = await listDatasets(effectiveOwner);
      setDatasets(dsList);
      const ids = new Set(dsList.map((d) => d.id));
      if (dsList.length > 0) {
        if (!selectedDatasetId || !ids.has(selectedDatasetId)) {
          setSelectedDatasetId(dsList[0].id);
        }
      } else {
        setSelectedDatasetId(null);
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleLoad() {
    const dsId = selectedDatasetId ?? datasets[0]?.id ?? null;
    if (!dsId) return;
    setLoading(true);
    setMessage("");
    try {
      const [stimuliData, summary, count] = await Promise.all([
        listStimuli(5000, dsId),
        getAnnotatedSummary(dsId),
        getCountSummary(dsId, true),
      ]);
      setStimuli(stimuliData);
      setRolledWord(null);
      setCountSummary(count);
      const map: Record<string, string> = {};
      for (const item of summary) {
        map[item.stimulus_id] = item.whole_word_hex.replace(/^#/, "").padStart(6, "0");
      }
      setAnnotatedColors(map);
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleRoll() {
    if (stimuli.length === 0) return;
    const shuffled = shuffleArray(stimuli);
    setRolledWord(shuffled[0]);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteStimulus(id);
      setStimuli((prev) => prev.filter((s) => s.id !== id));
      setRolledWord((prev) => (prev?.id === id ? null : prev));
      setAnnotatedColors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCountSummary((prev) =>
        prev
          ? {
              total: Math.max(0, prev.total - 1),
              annotated: Math.max(0, prev.annotated - (annotatedColors[id] ? 1 : 0)),
            }
          : prev
      );
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  }

  const TEAR_THRESHOLD = 80;

  function triggerTearOff() {
    if (!noteText.trim()) {
      setMessage("Write something on the note first");
      return;
    }
    if (createLoading || isTearing) return;
    setIsTearing(true);
    const textToSubmit = noteText.trim();
    setMessage("");
    tearTimeoutRef.current = setTimeout(async () => {
      try {
        setCreateLoading(true);
        const dsId = selectedDatasetId ?? datasets[0]?.id ?? null;
        const r = await bulkImportStimuli(textToSubmit, "en", "bulk", dsId);
        setNoteText("");
        setMessage(`${r.created} added, ${r.skipped} already existed`);
        handleLoad();
      } catch (err) {
        setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setCreateLoading(false);
        setIsTearing(false);
        tearTimeoutRef.current = null;
      }
    }, 500);
  }

  function handleTapePointerDown(e: React.PointerEvent) {
    if (isTearing || createLoading) return;
    dragStartRef.current = { y: 0, clientY: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleTapePointerMove(e: React.PointerEvent) {
    if (!dragStartRef.current || isTearing) return;
    const dy = dragStartRef.current.clientY - e.clientY;
    if (dy > 0) setDragY(Math.min(dy, 150));
    else setDragY(0);
  }

  function handleTapePointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragY >= TEAR_THRESHOLD) triggerTearOff();
    setDragY(0);
    dragStartRef.current = null;
  }

  function handleTapePointerLeave() {
    if (dragStartRef.current) {
      if (dragY >= TEAR_THRESHOLD) triggerTearOff();
      setDragY(0);
      dragStartRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (tearTimeoutRef.current) clearTimeout(tearTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setUserRoleState(getUserRole());
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [effectiveOwner]);

  useEffect(() => {
    if (createModalOpen) {
      const source = getAnnotatorAlphabetSource(effectiveOwner);
      const validSource = source && datasets.some((d) => d.id === source) ? source : "";
      setCreateMigrateFromId(validSource);
    }
  }, [createModalOpen, effectiveOwner, datasets]);

  useEffect(() => {
    if (datasets.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets]);

  useEffect(() => {
    if (selectedDatasetId) handleLoad();
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const onFocus = () => {
      handleLoad();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        handleLoad();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedDatasetId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/90">
          SynGlyph
        </span>
        <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1">
          <span className="text-xs text-white/50">身份</span>
          <select
            value={userRole}
            onChange={(e) => {
              const v = e.target.value as "default" | "admin";
              setUserRole(v);
              setUserRoleState(v);
            }}
            className="border-0 bg-transparent text-sm text-white/90 focus:outline-none [&>option]:bg-[#1a1a24]"
          >
            <option value="default">默认用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1">
          <span className="text-xs text-white/50">Dataset</span>
          <select
            value={selectedDatasetId ?? ""}
            onChange={(e) => setSelectedDatasetId(e.target.value || null)}
            className="border-0 bg-transparent text-sm text-white/90 focus:outline-none [&>option]:bg-[#1a1a24]"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id} className="bg-[#1a1a24] text-white">
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
          aria-label="New dataset"
        >
          + New
        </button>
        {countSummary !== null && (
          <span className="text-sm text-white/60">
            已标注 {countSummary.annotated} / {countSummary.total}
          </span>
        )}
        <button
          type="button"
          onClick={async () => {
            setRawModalOpen(true);
            try {
              const dsId = selectedDatasetId ?? datasets[0]?.id ?? null;
              const data = await getRawExport(dsId);
              setRawData(JSON.stringify(data, null, 2));
            } catch (e) {
              setRawData(`Error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white/80 hover:bg-white/10"
          aria-label="Raw data"
        >
          <NotebookIcon className="h-5 w-5" />
        </button>
        <Link href="/english" className="rounded-full border border-emerald-400/35 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/15">
          English 产品
        </Link>
        <Link href="/glyph-graph" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Graph lab</Link>
        <Link href="/glyph-pieces" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">部件编辑</Link>
        <Link href="/manage" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">管理</Link>
        <Link href="/seed/words" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Seed</Link>
        <Link href="/workbench" className="rounded-full border border-cyan-400/35 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/15">AL bench</Link>
        <Link href="/lab/kb" className="rounded-full border border-violet-400/35 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/15">KB lab</Link>
        <Link
          href="/text-reveal"
          className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
        >
          Text reveal
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pt-24 pb-12">

        <div className="flex w-full max-w-2xl flex-shrink-0 flex-col items-center gap-6">
          <div
            className="relative select-none"
            style={{
              transform: `translateY(-${dragY}px)`,
              transition: dragY === 0 && !isTearing ? "transform 0.2s ease-out" : "none",
            }}
          >
            {/* Tape strip - drag here to tear off */}
            <div
              role="button"
              tabIndex={0}
              onPointerDown={handleTapePointerDown}
              onPointerMove={handleTapePointerMove}
              onPointerUp={handleTapePointerUp}
              onPointerLeave={handleTapePointerLeave}
              onPointerCancel={handleTapePointerLeave}
              className="absolute -top-2 left-1/2 z-10 h-5 w-14 -translate-x-1/2 cursor-grab rounded-sm border border-white/20 bg-white/15 active:cursor-grabbing"
              aria-label="Drag up to tear off and add words"
            />
            {/* Sticky note - dark card style to match annotate */}
            <div
              className={`relative overflow-hidden rounded-2xl border border-white/20 bg-[#1a1a24] shadow-2xl transition-all duration-500 ease-out ${
                isTearing ? "animate-tear-off" : ""
              }`}
              style={{
                width: 320,
                minHeight: 240,
              }}
            >
              <div
                className="absolute -top-2 left-1/2 h-5 w-14 -translate-x-1/2 rounded-sm border border-white/20 bg-white/10"
                aria-hidden
              />
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type words to add..."
                disabled={isTearing}
                className="font-caveat absolute inset-0 select-text resize-none border-0 bg-transparent p-6 pt-8 text-xl leading-relaxed text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
                rows={8}
              />
              {dragY > 0 && !isTearing && (
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-caveat text-sm text-white/60">
                  {dragY >= TEAR_THRESHOLD ? "Release to add" : "Keep pulling..."}
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleRoll}
          disabled={loading || stimuli.length === 0}
          className="mt-4 flex-shrink-0 rounded-full bg-sky-600 px-8 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Roll
        </button>

        {message && <p className="mt-2 flex-shrink-0 text-sm text-white/70">{message}</p>}

        {/* Slot machine: central rolled word */}
        <div className="mt-8 flex flex-1 flex-col items-center justify-center">
          {rolledWord ? (
            <Link
              href={`/annotate/${rolledWord.id}`}
              className="group relative flex flex-col items-center"
              onMouseEnter={() => setHoverId(rolledWord.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <div className="relative flex min-h-[140px] min-w-[280px] flex-col items-center justify-center rounded-2xl border border-white/20 bg-[#1a1a24] px-10 py-8 shadow-2xl transition-all duration-300">
                {hoverId === rolledWord.id && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, rolledWord.id)}
                    disabled={!!deletingId}
                    className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    aria-label="Delete word"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
                <span
                  className="text-4xl font-bold tracking-tight"
                  style={
                    annotatedColors[rolledWord.id]
                      ? {
                          color: hexWithHash(annotatedColors[rolledWord.id]),
                          textDecoration: "underline",
                          textUnderlineOffset: 4,
                        }
                      : { color: "white" }
                  }
                >
                  {rolledWord.text}
                </span>
                <span className="mt-2 text-sm text-white/60">
                  {annotatedColors[rolledWord.id] ? "已标注 · 点击进入" : "点击开始标注"}
                </span>
              </div>
            </Link>
          ) : (
            <div className="flex min-h-[140px] min-w-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 px-10 py-8">
              <span className="text-white/60">
                {stimuli.length > 0 ? "点击 Roll 抽取一个词" : "先添加词再 Roll"}
              </span>
            </div>
          )}
        </div>

        {/* 浏览全部 - 可视化所有词（含已标注） */}
        <div className="mt-8 w-full max-w-4xl flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowAllWords(!showAllWords)}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90"
          >
            <span className="inline-block transition-transform">{showAllWords ? "▼" : "▶"}</span>
            浏览全部 ({countSummary?.total ?? stimuli.length} 词
            {` · 已标注 ${countSummary?.annotated ?? Object.keys(annotatedColors).length}`}
            )
          </button>
          {showAllWords && stimuli.length > 0 && (
            <div className="mt-3 rounded-2xl border border-white/20 bg-[#1a1a24] p-4 shadow-2xl">
              <p className="mb-3 text-xs text-white/60">
                已标注词显示为彩色+下划线。点击进入编辑。若无词请确认上方选择了正确的 dataset（如 Default）。
              </p>
              <div className="flex flex-wrap gap-2">
                {stimuli.map((s) => {
                  const hex = annotatedColors[s.id];
                  const isAnnotated = !!hex;
                  const isHover = hoverId === s.id;
                  return (
                    <Link
                      key={s.id}
                      href={`/annotate/${s.id}`}
                      className="group relative rounded-lg px-3 py-2 transition"
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      {isHover && (
                        <div className="absolute inset-0 rounded-lg bg-white/10" />
                      )}
                      {isHover && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, s.id)}
                          disabled={!!deletingId}
                          className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded border border-white/20 text-white/70 hover:bg-white/10"
                          aria-label="删除"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      )}
                      <span
                        className="relative z-10 font-medium"
                        style={
                          isAnnotated
                            ? {
                                color: hexWithHash(hex),
                                textDecoration: "underline",
                                textUnderlineOffset: 2,
                              }
                            : { color: "rgba(255,255,255,0.9)" }
                        }
                      >
                        {s.text}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create dataset modal */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/20 bg-[#1a1a24] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-white/90">新建 Dataset</h2>
            <p className="text-sm text-white/60">将自动包含字母表 a–z</p>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Dataset 名称"
              className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <div>
              <label className="mb-2 block text-sm text-white/70">迁移字母表颜色自</label>
              <select
                value={createMigrateFromId}
                onChange={(e) => setCreateMigrateFromId(e.target.value)}
                className="w-full rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-white/90 focus:outline-none [&>option]:bg-[#1a1a24]"
              >
                <option value="">不迁移</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg border border-white/30 px-4 py-2 text-white/80 hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                disabled={createLoading || !createName.trim()}
                onClick={async () => {
                  setCreateLoading(true);
                  try {
                    const ds = await createDataset(
                      createName.trim() || "New Dataset",
                      effectiveOwner,
                      createMigrateFromId || null
                    );
                    setDatasets((prev) => [ds, ...prev]);
                    setSelectedDatasetId(ds.id);
                    setCreateModalOpen(false);
                    setCreateName("");
                    setCreateMigrateFromId("");
                    handleLoad();
                  } catch (e) {
                    setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setCreateLoading(false);
                  }
                }}
                className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {createLoading ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw data modal */}
      {rawModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRawModalOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/20 bg-[#1a1a24] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
              <h2 className="font-semibold text-white/90">Raw Data</h2>
              <button
                type="button"
                onClick={() => setRawModalOpen(false)}
                className="rounded-full border border-white/20 p-2 text-white/70 hover:bg-white/10"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <pre className="overflow-auto p-4 text-xs text-white/80" style={{ fontFamily: "ui-monospace, monospace" }}>
              {rawData || "Loading..."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
