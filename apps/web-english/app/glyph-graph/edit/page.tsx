"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getGlyphGraphPayload, listGlyphGraphRecords, saveGlyphGraphPayload } from "@/lib/api";
import { GlyphGraphSvgEditor } from "@/components/glyph-graph/GlyphGraphSvgEditor";
import { LOWERCASE_ENGLISH_LETTERS, PRIORITY_EXPERIMENT_LETTERS } from "@/lib/glyph-editor/lowercase";
import type { PreprocessResult } from "@/lib/glyph-editor/preprocess";
import { runPreprocess } from "@/lib/glyph-editor/preprocess";
import {
  extractGlyphGraphFromPreprocess,
  rebuildGlyphGraphFromTopology,
  type GlyphGraphExportV1,
  type TopologyEdge,
  type TopologyNode,
} from "@/lib/glyph-editor/primitiveGraph";
import { renderLetterToImageData } from "@/lib/glyph-graph/renderLetterCanvas";

function imageDataToPngDataUrl(im: ImageData): string {
  const c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height;
  c.getContext("2d")!.putImageData(im, 0, 0);
  return c.toDataURL("image/png");
}

function exportToTopology(exp: GlyphGraphExportV1): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  return {
    nodes: exp.skeletonTopology.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      role: n.type === "junction" ? ("junction" as const) : ("endpoint" as const),
      ...(n.strokeColor ? { strokeColor: n.strokeColor } : {}),
    })),
    edges: exp.skeletonTopology.edges.map((e) => {
      const edge: TopologyEdge = { from: e.from, to: e.to };
      if (e.cp1x != null) edge.cp1x = e.cp1x;
      if (e.cp1y != null) edge.cp1y = e.cp1y;
      if (e.cp2x != null) edge.cp2x = e.cp2x;
      if (e.cp2y != null) edge.cp2y = e.cp2y;
      return edge;
    }),
  };
}

function isGlyphExportV1(x: unknown): x is GlyphGraphExportV1 {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as GlyphGraphExportV1).version === 1 &&
    typeof (x as GlyphGraphExportV1).char === "string"
  );
}

type LetterCacheEntry = {
  pre: PreprocessResult;
  topology: { nodes: TopologyNode[]; edges: TopologyEdge[] };
  exportData: GlyphGraphExportV1;
  copybookImageDataUrl: string | null;
};

export default function GlyphGraphEditPage() {
  const [letter, setLetter] = useState("b");
  const [pre, setPre] = useState<PreprocessResult | null>(null);
  const [exportData, setExportData] = useState<GlyphGraphExportV1 | null>(null);
  const [topology, setTopology] = useState<{ nodes: TopologyNode[]; edges: TopologyEdge[] } | null>(null);
  const [message, setMessage] = useState("");
  const [copybookImageDataUrl, setCopybookImageDataUrl] = useState<string | null>(null);
  const [savedChars, setSavedChars] = useState<string[]>([]);

  /** 本会话内按字母缓存，切换 a↔b 时恢复未保存的编辑 */
  const letterCacheRef = useRef(new Map<string, LetterCacheEntry>());
  const prevLetterRef = useRef<string | null>(null);
  const latestStateRef = useRef<{
    pre: PreprocessResult | null;
    topology: { nodes: TopologyNode[]; edges: TopologyEdge[] } | null;
    exportData: GlyphGraphExportV1 | null;
    copybookImageDataUrl: string | null;
  }>({
    pre: null,
    topology: null,
    exportData: null,
    copybookImageDataUrl: null,
  });
  latestStateRef.current = { pre, topology, exportData, copybookImageDataUrl };

  const putCache = useCallback((ch: string, entry: LetterCacheEntry) => {
    letterCacheRef.current.set(ch, entry);
  }, []);

  const runPipeline = useCallback(
    (ch: string) => {
      setMessage("");
      const im = renderLetterToImageData(ch);
      const url = imageDataToPngDataUrl(im);
      setCopybookImageDataUrl(url);
      const p = runPreprocess(im);
      setPre(p);
      const exp = extractGlyphGraphFromPreprocess(p, ch);
      setExportData(exp);
      const topo = exportToTopology(exp);
      setTopology(topo);
      putCache(ch, { pre: p, topology: topo, exportData: exp, copybookImageDataUrl: url });
    },
    [putCache]
  );

  useEffect(() => {
    if (letter.length !== 1 || letter < "a" || letter > "z") return;

    const prev = prevLetterRef.current;
    if (prev !== null && prev !== letter) {
      const s = latestStateRef.current;
      if (s.pre && s.topology && s.exportData) {
        letterCacheRef.current.set(prev, {
          pre: s.pre,
          topology: s.topology,
          exportData: s.exportData,
          copybookImageDataUrl: s.copybookImageDataUrl,
        });
      }
    }
    prevLetterRef.current = letter;

    const cached = letterCacheRef.current.get(letter);
    if (cached) {
      setCopybookImageDataUrl(cached.copybookImageDataUrl);
      setPre(cached.pre);
      setTopology(cached.topology);
      setExportData(cached.exportData);
      setMessage("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const raw = await getGlyphGraphPayload(letter);
        if (cancelled) return;
        if (isGlyphExportV1(raw)) {
          const im = renderLetterToImageData(letter);
          const url = imageDataToPngDataUrl(im);
          const p = runPreprocess(im);
          const topo = exportToTopology(raw);
          const exp = rebuildGlyphGraphFromTopology(p, letter, topo);
          setCopybookImageDataUrl(url);
          setPre(p);
          setTopology(topo);
          setExportData(exp);
          putCache(letter, { pre: p, topology: topo, exportData: exp, copybookImageDataUrl: url });
          setMessage("");
          return;
        }
      } catch {
        /* 无服务端记录 */
      }
      if (cancelled) return;
      runPipeline(letter);
    })();

    return () => {
      cancelled = true;
    };
  }, [letter, putCache, runPipeline]);

  const setTopologySafe = useCallback(
    (next: { nodes: TopologyNode[]; edges: TopologyEdge[] }) => {
      setTopology(next);
      if (pre) {
        setExportData(rebuildGlyphGraphFromTopology(pre, letter, next));
      }
    },
    [letter, pre]
  );

  useEffect(() => {
    listGlyphGraphRecords()
      .then((r) => setSavedChars(r.chars))
      .catch(() => setSavedChars([]));
  }, []);

  async function handleLoadServer() {
    setMessage("");
    try {
      const raw = await getGlyphGraphPayload(letter);
      if (!isGlyphExportV1(raw)) {
        setMessage("Invalid payload from server");
        return;
      }
      const im = renderLetterToImageData(letter);
      const url = imageDataToPngDataUrl(im);
      setCopybookImageDataUrl(url);
      const p = runPreprocess(im);
      setPre(p);
      const topo = exportToTopology(raw);
      setTopology(topo);
      const exp = rebuildGlyphGraphFromTopology(p, letter, topo);
      setExportData(exp);
      putCache(letter, {
        pre: p,
        topology: topo,
        exportData: exp,
        copybookImageDataUrl: url,
      });
      setMessage(`Loaded saved topology for “${letter}”`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSave() {
    if (!exportData || !pre || !topology) return;
    setMessage("");
    try {
      const r = await saveGlyphGraphPayload(exportData as unknown as Record<string, unknown>);
      putCache(letter, {
        pre,
        topology,
        exportData,
        copybookImageDataUrl,
      });
      setMessage(`Saved graph for “${r.char}” (${r.id})`);
      const list = await listGlyphGraphRecords();
      setSavedChars(list.chars);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col px-4 pb-12 pt-20 text-white/90">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/25 px-3 py-1 text-sm text-white/80">
            Manual topology (SVG)
          </span>
          <Link href="/glyph-graph" className="text-sm text-sky-400 hover:underline">
            Graph lab
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:underline">
            Home
          </Link>
        </header>

        <p className="max-w-3xl text-sm leading-relaxed text-white/65">
          在字帖背景上拖动结点/边；点「保存到 API」会把当前导出写到与{" "}
          <Link href="/glyph-graph" className="text-sky-400 hover:underline">
            Graph lab
          </Link>{" "}
          相同的后端，之后在 Graph lab 用「从 API 加载」即可看到同一套拓扑。也可先「下载 JSON」再在 Graph lab「导入 JSON 文件」。切换字母时会暂存本会话内的编辑。
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Letter
            <select
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="rounded-lg border border-white/20 bg-[#1a1a24] px-3 py-2 text-base text-white"
            >
              {LOWERCASE_ENGLISH_LETTERS.split("").map((c) => (
                <option key={c} value={c}>
                  {c}
                  {PRIORITY_EXPERIMENT_LETTERS.has(c) ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => runPipeline(letter)}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
          >
            Reset from font
          </button>
          <button
            type="button"
            onClick={handleLoadServer}
            className="rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10"
          >
            从 API 加载
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!exportData}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
            title="写入与 Graph lab 共用的 glyph graph 接口"
          >
            保存到 API
          </button>
          <button
            type="button"
            disabled={!exportData}
            onClick={() => {
              if (!exportData) return;
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `glyph_graph_${letter}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            下载 JSON
          </button>
        </div>

        {message && <p className="text-sm text-amber-200/90">{message}</p>}

        <p className="text-xs text-white/45">
          ★ = first experiment set。服务器已保存字母：{savedChars.length ? savedChars.join(", ") : "无"}
        </p>

        {pre && topology && (
          <GlyphGraphSvgEditor
            pre={pre}
            topology={topology}
            onTopologyChange={setTopologySafe}
            copybookImageDataUrl={copybookImageDataUrl}
            copybookLight
          />
        )}

        <div className="rounded-xl border border-white/15 bg-[#12121a] p-4">
          <h3 className="mb-2 text-sm font-medium text-white/80">导出 JSON（预览；文件下载用上方「下载 JSON」）</h3>
          <pre className="max-h-[360px] overflow-auto text-xs leading-relaxed text-emerald-200/80">
            {exportData ? JSON.stringify(exportData, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
