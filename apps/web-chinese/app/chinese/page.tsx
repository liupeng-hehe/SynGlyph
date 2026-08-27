"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkImportChineseSessions,
  createChineseDictionary,
  createChineseSession,
  deleteChineseSession,
  listChineseDictionaries,
  listChineseSessions,
  type ChineseDictionaryRow,
  type ChineseSessionSummary,
} from "@/lib/apiChinese";
import { extractChineseCharsUniqueOrdered } from "@/lib/extractChineseChars";
import { effectiveOwner, getUserRole, setUserRole, type UserRole } from "@/lib/annotatorChinese";

const DICT_STORAGE = "synglyph_chinese_selected_dictionary_id";

export default function ChineseConsolePage() {
  const router = useRouter();
  const [userRole, setUserRoleState] = useState<UserRole>("default");
  const [dictionaries, setDictionaries] = useState<ChineseDictionaryRow[]>([]);
  const [selectedDictId, setSelectedDictId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChineseSessionSummary[]>([]);
  const [char, setChar] = useState("福");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDictName, setNewDictName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const owner = effectiveOwner(userRole);

  const bulkPreviewChars = useMemo(() => extractChineseCharsUniqueOrdered(bulkText), [bulkText]);

  const loadDicts = useCallback(async () => {
    setMsg("");
    try {
      const list = await listChineseDictionaries(owner);
      setDictionaries(list);
      const ids = new Set(list.map((d) => d.id));
      let sel = typeof window !== "undefined" ? localStorage.getItem(DICT_STORAGE) : null;
      if (!sel || !ids.has(sel)) sel = list[0]?.id ?? null;
      setSelectedDictId(sel);
      if (sel) localStorage.setItem(DICT_STORAGE, sel);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [owner]);

  const loadSessions = useCallback(async (dictId: string) => {
    try {
      const list = await listChineseSessions(dictId);
      setSessions(list);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    setUserRoleState(getUserRole());
  }, []);

  useEffect(() => {
    loadDicts();
  }, [loadDicts]);

  useEffect(() => {
    if (selectedDictId) {
      loadSessions(selectedDictId);
      localStorage.setItem(DICT_STORAGE, selectedDictId);
    } else {
      setSessions([]);
    }
  }, [selectedDictId, loadSessions]);

  async function startNewSession() {
    if (!selectedDictId) {
      setMsg("请先选择或新建字典");
      return;
    }
    const c = char.trim();
    if (c.length !== 1) {
      setMsg("请输入单个汉字");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const s = await createChineseSession(c, selectedDictId);
      router.push(`/chinese/session/${s.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport() {
    if (!selectedDictId) {
      setMsg("请先选择或新建字典");
      return;
    }
    const t = bulkText.trim();
    if (!t) {
      setMsg("请粘贴一段包含汉字的文本");
      return;
    }
    setBulkLoading(true);
    setMsg("");
    try {
      const r = await bulkImportChineseSessions(t, selectedDictId);
      const parts = [
        `已新建 ${r.created} 个字的会话`,
        r.skipped_duplicate > 0 ? `跳过 ${r.skipped_duplicate} 个（字典中已有）` : null,
        r.skipped_no_glyph.length > 0
          ? `无字形数据跳过：${r.skipped_no_glyph.join("、")}`
          : null,
      ].filter(Boolean);
      setMsg(parts.join("；"));
      setBulkText("");
      setBulkOpen(false);
      await loadSessions(selectedDictId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleDeleteSession(sessionId: string, character: string) {
    if (!selectedDictId) return;
    if (!window.confirm(`确定从当前字典中移除「${character}」这条会话吗？标注数据将一并删除。`)) return;
    setDeletingId(sessionId);
    setMsg("");
    try {
      await deleteChineseSession(sessionId, selectedDictId);
      await loadSessions(selectedDictId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateDictionary() {
    const name = newDictName.trim() || "新字典";
    setLoading(true);
    setMsg("");
    try {
      const d = await createChineseDictionary(name, owner);
      setDictionaries((prev) => [d, ...prev]);
      setSelectedDictId(d.id);
      setCreateOpen(false);
      setNewDictName("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#ebe4d8] text-stone-900">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-stone-400/50 bg-[#ebe4d8]/95 px-4 py-3 backdrop-blur">
        <span className="rounded-full border border-stone-400/70 bg-white/80 px-3 py-1 text-sm font-semibold text-stone-900 shadow-sm">
          SynGlyph · 中文
        </span>
        <div className="flex items-center gap-2 rounded-full border border-stone-400/60 bg-white/70 px-3 py-1">
          <span className="text-xs text-stone-500">身份</span>
          <select
            value={userRole}
            onChange={(e) => {
              const v = e.target.value as UserRole;
              setUserRole(v);
              setUserRoleState(v);
            }}
            className="border-0 bg-transparent text-sm text-stone-800 focus:outline-none"
          >
            <option value="default">默认用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-stone-400/60 bg-white/70 px-3 py-1">
          <span className="text-xs text-stone-500">字典</span>
          <select
            value={selectedDictId ?? ""}
            onChange={(e) => setSelectedDictId(e.target.value || null)}
            className="max-w-[12rem] border-0 bg-transparent text-sm text-stone-800 focus:outline-none"
          >
            {dictionaries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-full border border-stone-400/70 bg-white/80 px-3 py-1 text-sm text-stone-800 hover:bg-white"
        >
          + 新建字典
        </button>
        <a
          href="#"
          className="rounded-full border border-stone-400/50 px-3 py-1 text-sm text-sky-900 hover:bg-white/60"
          onClick={(e) => e.preventDefault()}
        >
          帮助
        </a>
        <span className="text-xs text-stone-500">当前 owner 数据：{owner}</span>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold text-stone-900">主控制台</h1>
        <p className="mb-6 text-sm text-stone-600">
          选择字典后，新建会话或从下列列表进入标注。标注页可随时「返回主菜单」回到此处。
        </p>

        <div className="mb-8 space-y-3 rounded-xl border border-stone-300/90 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-stone-500">新建标注 · 汉字</span>
              <input
                className="mt-1 block w-24 rounded border border-stone-300 bg-white px-3 py-2 text-center text-2xl text-stone-900 shadow-sm"
                value={char}
                maxLength={1}
                onChange={(e) => setChar(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={loading || !selectedDictId}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              onClick={startNewSession}
            >
              {loading ? "…" : "开始标注"}
            </button>
            <button
              type="button"
              disabled={!selectedDictId}
              className="rounded-lg border border-stone-400/80 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              onClick={() => {
                setBulkOpen(true);
                setMsg("");
              }}
            >
              批量添加…
            </button>
          </div>
          <p className="text-xs text-stone-500">
            「批量添加」会打开对话框：粘贴任意中文段落，系统只提取其中的汉字，按首次出现顺序、每个不同字各建一条会话并加入当前字典（已有该字的会话会跳过）。
          </p>
        </div>

        {msg && <p className="mb-4 text-sm text-amber-900">{msg}</p>}

        <section>
          <h2 className="mb-3 text-lg font-medium text-stone-800">
            本会话列表（{sessions.length}）
          </h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-stone-500">该字典下暂无会话，请新建标注。</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="relative">
                  <Link
                    href={`/chinese/session/${s.id}`}
                    className="flex items-center justify-between rounded-lg border border-stone-300/80 bg-white py-3 pl-4 pr-12 shadow-sm transition hover:border-emerald-600/40 hover:bg-emerald-50/30"
                  >
                    <span
                      className={`font-serif text-2xl ${
                        s.region_count === 0
                          ? "text-stone-400"
                          : s.preview_color_hex
                            ? ""
                            : "text-emerald-700"
                      }`}
                      style={
                        s.preview_color_hex
                          ? { color: s.preview_color_hex }
                          : undefined
                      }
                      title={
                        s.region_count === 0
                          ? "尚未划分区域"
                          : "已标注（颜色为区域平均色，与画布彩色预览一致）"
                      }
                    >
                      {s.character || "—"}
                    </span>
                    <span className="shrink-0 text-right text-xs text-stone-500">
                      区域 {s.region_count} · {s.updated_at?.slice(0, 19) ?? s.id.slice(0, 8)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    title="从当前字典删除此标注"
                    aria-label={`删除「${s.character || "—"}」`}
                    disabled={deletingId === s.id}
                    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-stone-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDeleteSession(s.id, s.character || "—");
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="mt-10 flex gap-4 text-sm text-sky-800 underline">
          <Link href="/chinese/history">历史</Link>
          <Link href="/chinese/template/福">模板示例（福）</Link>
        </nav>
      </main>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-stone-300 bg-[#faf8f5] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-stone-900">新建字典</h2>
            <p className="mt-1 text-sm text-stone-600">字典用于隔离不同任务或语料（对标英文 Dataset）。</p>
            <input
              type="text"
              value={newDictName}
              onChange={(e) => setNewDictName(e.target.value)}
              placeholder="字典名称"
              className="mt-4 w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-stone-700 hover:bg-stone-200"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={loading}
                className="rounded-lg bg-emerald-700 px-4 py-1.5 text-white hover:bg-emerald-600 disabled:opacity-50"
                onClick={handleCreateDictionary}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !bulkLoading && setBulkOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-stone-300 bg-[#faf8f5] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-stone-900">批量添加汉字</h2>
            <p className="mt-1 text-sm text-stone-600">
              粘贴任意文本，仅提取其中的汉字；按首次出现顺序、每个不同字在当前字典中新建一条会话（与英文主控制台「便签撕下」批量导入类似）。
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="例如：春风又绿江南岸，明月何时照我还。"
              rows={8}
              disabled={bulkLoading}
              className="mt-4 w-full rounded border border-stone-300 bg-white px-3 py-2 font-serif text-base text-stone-900 placeholder:text-stone-400"
            />
            <p className="mt-2 text-xs text-stone-500">
              预览：将提取{" "}
              <span className="font-medium text-stone-800">{bulkPreviewChars.length}</span> 个不同汉字
              {bulkPreviewChars.length > 0 && (
                <span className="ml-1 font-serif text-stone-700">（{bulkPreviewChars.join(" ")}）</span>
              )}
              。仅服务端存在字形 JSON 的字会真正入库；请确认已启动 API 且{" "}
              <code className="rounded bg-stone-200 px-1">NEXT_PUBLIC_API_URL</code> 指向该 API。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkLoading}
                className="rounded-lg px-3 py-1.5 text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                onClick={() => setBulkOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={bulkLoading || !bulkText.trim()}
                className="rounded-lg bg-emerald-700 px-4 py-1.5 text-white hover:bg-emerald-600 disabled:opacity-50"
                onClick={handleBulkImport}
              >
                {bulkLoading ? "导入中…" : "导入到当前字典"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
