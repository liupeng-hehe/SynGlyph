"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  listDatasets,
  listStimuli,
  getAnnotatedSummary,
  deleteStimulus,
  deleteDataset,
  importAlphabetToDataset,
} from "@/lib/api";
import {
  setAnnotatorAlphabetSource,
  getUserRole,
  setUserRole,
} from "@/lib/annotator";
import type { Stimulus } from "@synglyph/shared";

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function ManagePage() {
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [annotatedIds, setAnnotatedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importingAlphabet, setImportingAlphabet] = useState(false);
  const [importSourceId, setImportSourceId] = useState("");
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);
  const [showDatasetManage, setShowDatasetManage] = useState(false);
  const [userRole, setUserRoleState] = useState<"default" | "admin">("default");

  const effectiveOwner = userRole === "admin" ? "admin" : "default";

  const load = useCallback(async () => {
    const dsId = selectedDatasetId ?? datasets[0]?.id ?? null;
    if (!dsId) return;
    setLoading(true);
    try {
      const [stimList, summary] = await Promise.all([
        listStimuli(5000, dsId),
        getAnnotatedSummary(dsId),
      ]);
      setStimuli(stimList);
      setAnnotatedIds(new Set(summary.map((s) => s.stimulus_id)));
      setMessage("");
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [selectedDatasetId, datasets]);

  useEffect(() => {
    setUserRoleState(getUserRole());
  }, []);

  useEffect(() => {
    listDatasets(effectiveOwner)
      .then((dsList) => {
        setDatasets(dsList);
        const ids = new Set(dsList.map((d) => d.id));
        if (dsList.length > 0) {
          if (!selectedDatasetId || !ids.has(selectedDatasetId)) {
            setSelectedDatasetId(dsList[0].id);
          }
        } else {
          setSelectedDatasetId(null);
        }
      })
      .catch((e) => setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`));
  }, [effectiveOwner]);

  useEffect(() => {
    if (selectedDatasetId) load();
  }, [selectedDatasetId, load]);

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteStimulus(id);
      setStimuli((prev) => prev.filter((s) => s.id !== id));
      setAnnotatedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="absolute left-4 top-4 flex items-center gap-3">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">
          ← Home
        </Link>
        <h1 className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/90">数据管理</h1>
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
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowDatasetManage((s) => !s)}
          className="rounded-full border border-white/30 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
        >
          {showDatasetManage ? "隐藏 Dataset 管理" : "管理 Dataset"}
        </button>
        {selectedDatasetId && (
          <button
            type="button"
            onClick={() => {
              if (!selectedDatasetId) return;
              setAnnotatorAlphabetSource(
                effectiveOwner,
                selectedDatasetId
              );
              setMessage("已设为当前身份的字母表来源");
            }}
            className="rounded-full border border-white/30 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
            title="将此 dataset 设为当前标注者的字母表来源，新建 dataset 时自动迁移"
          >
            设为我的字母表来源
          </button>
        )}
        {selectedDatasetId && datasets.length > 1 && (
          <div className="flex items-center gap-2">
            <select
              value={importSourceId}
              onChange={(e) => setImportSourceId(e.target.value)}
              className="rounded-full border border-white/30 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none [&>option]:bg-[#1a1a24]"
            >
              <option value="">从 dataset 导入字母表…</option>
              {datasets
                .filter((d) => d.id !== selectedDatasetId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!importSourceId || !selectedDatasetId) return;
                setImportingAlphabet(true);
                setMessage("");
                try {
                  const r = await importAlphabetToDataset(selectedDatasetId, importSourceId);
                  setMessage(`已导入 ${r.imported} 个字母的颜色标注`);
                  load();
                } catch (e) {
                  setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setImportingAlphabet(false);
                }
              }}
              disabled={importingAlphabet || !importSourceId}
              className="rounded-full border border-white/30 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:opacity-50"
            >
              {importingAlphabet ? "导入中…" : "导入"}
            </button>
          </div>
        )}
      </div>

      {showDatasetManage && (
        <div className="mx-auto mt-4 w-full max-w-2xl space-y-4 rounded-2xl border border-white/20 bg-[#1a1a24] px-4 py-3">
          <div>
            <h3 className="mb-3 text-sm font-medium text-white/80">删除 Dataset</h3>
          <ul className="space-y-2">
            {datasets.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-white/15 px-3 py-2"
              >
                <span className="text-white/90">{d.name}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`确定删除 "${d.name}"？此操作不可恢复。`)) return;
                    setDeletingDatasetId(d.id);
                    try {
                      await deleteDataset(d.id);
                      setDatasets((prev) => prev.filter((x) => x.id !== d.id));
                      if (selectedDatasetId === d.id) {
                        const rest = datasets.filter((x) => x.id !== d.id);
                        setSelectedDatasetId(rest[0]?.id ?? null);
                      }
                      setMessage("已删除");
                    } catch (e) {
                      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                      setDeletingDatasetId(null);
                    }
                  }}
                  disabled={!!deletingDatasetId}
                  className="rounded border border-red-500/50 px-3 py-1 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {deletingDatasetId === d.id ? "删除中…" : "删除"}
                </button>
              </li>
            ))}
          </ul>
          </div>
        </div>
      )}

      <div className="mx-auto mt-24 max-w-4xl w-full px-4">
        {message && (
          <div
            className={`mb-4 flex items-center justify-between gap-4 rounded-2xl px-4 py-3 text-sm ${
              message.startsWith("Error:")
                ? "border border-red-500/30 bg-red-500/10 text-red-200"
                : "border border-green-500/30 bg-green-500/10 text-green-200"
            }`}
          >
            <span>{message}</span>
            <button
              type="button"
              onClick={async () => {
                setMessage("");
                try {
                  const dsList = await listDatasets(effectiveOwner);
                  setDatasets(dsList);
                  if (dsList.length > 0) {
                    setSelectedDatasetId(dsList[0].id);
                    const [stimList, summary] = await Promise.all([
                      listStimuli(5000, dsList[0].id),
                      getAnnotatedSummary(dsList[0].id),
                    ]);
                    setStimuli(stimList);
                    setAnnotatedIds(new Set(summary.map((s) => s.stimulus_id)));
                  }
                } catch (e) {
                  setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
              className="rounded-full border border-white/30 px-3 py-1 text-white/90 hover:bg-white/10"
            >
              重试
            </button>
          </div>
        )}
        {loading && <p className="mb-4 text-sm text-white/60">Loading...</p>}

        <div className="rounded-2xl border border-white/20 bg-[#1a1a24] shadow-2xl">
          <div className="border-b border-white/20 px-4 py-3 text-sm font-medium text-white/80">
            共 {stimuli.length} 词 · 已标注 {annotatedIds.size} 个
          </div>
          <ul className="divide-y divide-gray-100">
            {stimuli.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Link
                    href={`/annotate/${s.id}`}
                    className="font-medium text-white/90 hover:text-white"
                  >
                    {s.text}
                  </Link>
                  {annotatedIds.has(s.id) && (
                    <span className="rounded border border-green-500/50 bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
                      已标注
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={!!deletingId}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 hover:bg-white/10 disabled:opacity-50"
                  aria-label="删除"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
