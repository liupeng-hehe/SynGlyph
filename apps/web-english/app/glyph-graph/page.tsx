"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  exportAllGlyphGraphPayloads,
  getGlyphGraphPayload,
  listGlyphGraphRecords,
  saveGlyphGraphPayload,
} from "@/lib/api";
import { LOWERCASE_ENGLISH_LETTERS, PRIORITY_EXPERIMENT_LETTERS } from "@/lib/glyph-editor/lowercase";
import { runPreprocess } from "@/lib/glyph-editor/preprocess";
import {
  extractGlyphGraphFromPreprocess,
  type GlyphGraphExportV1,
} from "@/lib/glyph-editor/primitiveGraph";
import {
  buildSkeletonRasterFromGlyphExport,
  glyphExportToSkeletonPngBlob,
} from "@/lib/glyph-graph/skeletonPngExport";
import { GLYPH_GRAPH_CANVAS, renderLetterToImageData } from "@/lib/glyph-graph/renderLetterCanvas";
import JSZip from "jszip";

function drawBinary(
  canvas: HTMLCanvasElement | null,
  binary: Uint8Array,
  w: number,
  h: number
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = binary[i] ? 0 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawSkeleton(canvas: HTMLCanvasElement | null, sk: Uint8Array, w: number, h: number) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#4ade80";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (sk[y * w + x]) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawGraphOverlay(
  canvas: HTMLCanvasElement | null,
  exp: GlyphGraphExportV1,
  w: number,
  h: number
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, w, h);
  const edges = exp.skeletonTopology?.edges ?? [];
  edges.forEach((e, i) => {
    ctx.strokeStyle = `hsl(${(i * 47) % 360}, 75%, 55%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const pts = e.pixels;
    if (pts.length === 0) return;
    ctx.moveTo(pts[0]!.x + 0.5, pts[0]!.y + 0.5);
    for (let k = 1; k < pts.length; k++) {
      ctx.lineTo(pts[k]!.x + 0.5, pts[k]!.y + 0.5);
    }
    ctx.stroke();
  });
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px ui-monospace, monospace";
  for (const n of exp.skeletonTopology?.nodes ?? []) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = n.type === "junction" ? "#fbbf24" : "#93c5fd";
    ctx.fill();
    ctx.strokeStyle = "#1e1e2e";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(n.id, n.x + 6, n.y - 4);
  }
}

function isGlyphExportV1(x: unknown): x is GlyphGraphExportV1 {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as GlyphGraphExportV1).version === 1 &&
    typeof (x as GlyphGraphExportV1).char === "string"
  );
}

type GlyphLabCanvases = {
  binary: HTMLCanvasElement | null;
  sk: HTMLCanvasElement | null;
  graph: HTMLCanvasElement | null;
};

/** Draw binary from font + skeleton/graph from payload only. */
function applyGlyphExportToCanvases(
  canvases: GlyphLabCanvases,
  payload: GlyphGraphExportV1,
  letterForBinary: string,
  options?: { preferEmptySkeletonOnMismatch?: boolean }
) {
  const im = renderLetterToImageData(letterForBinary);
  const pre = runPreprocess(im);
  const w = pre.width;
  const h = pre.height;
  drawBinary(canvases.binary, pre.binary, w, h);
  const imgW = payload.image?.width;
  const imgH = payload.image?.height;
  const hasExplicitDims = typeof imgW === "number" && typeof imgH === "number";
  const dimsMatch = !hasExplicitDims || (imgW === w && imgH === h);
  const skFromArchive = dimsMatch ? buildSkeletonRasterFromGlyphExport(payload, w, h) : null;
  let fallbackSk = pre.skeleton;
  if (!skFromArchive && options?.preferEmptySkeletonOnMismatch) {
    fallbackSk = new Uint8Array(w * h);
  }
  drawSkeleton(canvases.sk, skFromArchive ?? fallbackSk, w, h);
  drawGraphOverlay(canvases.graph, payload, w, h);
}

function clearGraphCanvasesNoArchive(canvases: GlyphLabCanvases, letter: string) {
  const im = renderLetterToImageData(letter);
  const pre = runPreprocess(im);
  const w = pre.width;
  const h = pre.height;
  drawBinary(canvases.binary, pre.binary, w, h);
  drawSkeleton(canvases.sk, new Uint8Array(w * h), w, h);
  const ctx = canvases.graph?.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, w, h);
  }
}

export default function GlyphGraphPage() {
  const [letter, setLetter] = useState("b");
  const [exportData, setExportData] = useState<GlyphGraphExportV1 | null>(null);
  const [message, setMessage] = useState("");
  const [savedChars, setSavedChars] = useState<string[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  /** When true, letter switch only shows API payloads (no extractGlyphGraphFromPreprocess). */
  const [bulkManualOnly, setBulkManualOnly] = useState(false);
  const [bulkPayloadsByChar, setBulkPayloadsByChar] = useState<Record<string, GlyphGraphExportV1> | null>(
    null
  );
  const [loadingBulkAll, setLoadingBulkAll] = useState(false);
  const [loadingSkeletonZip, setLoadingSkeletonZip] = useState(false);

  const refBinary = useRef<HTMLCanvasElement>(null);
  const refSk = useRef<HTMLCanvasElement>(null);
  const refGraph = useRef<HTMLCanvasElement>(null);

  const labCanvases = (): GlyphLabCanvases => ({
    binary: refBinary.current,
    sk: refSk.current,
    graph: refGraph.current,
  });

  const runPipeline = useCallback((ch: string) => {
    setMessage("");
    const im = renderLetterToImageData(ch);
    const pre = runPreprocess(im);
    const exp = extractGlyphGraphFromPreprocess(pre, ch);
    setExportData(exp);
    drawBinary(refBinary.current, pre.binary, pre.width, pre.height);
    drawSkeleton(refSk.current, pre.skeleton, pre.width, pre.height);
    drawGraphOverlay(refGraph.current, exp, pre.width, pre.height);
  }, []);

  useEffect(() => {
    if (letter.length !== 1 || letter < "a" || letter > "z") return;
    if (bulkManualOnly && bulkPayloadsByChar) {
      const p = bulkPayloadsByChar[letter];
      if (p) {
        setExportData(p);
        applyGlyphExportToCanvases(labCanvases(), p, letter, { preferEmptySkeletonOnMismatch: true });
      } else {
        setExportData(null);
        clearGraphCanvasesNoArchive(labCanvases(), letter);
      }
      return;
    }
    runPipeline(letter);
  }, [letter, runPipeline, bulkManualOnly, bulkPayloadsByChar]);

  useEffect(() => {
    listGlyphGraphRecords()
      .then((r) => setSavedChars(r.chars))
      .catch(() => setSavedChars([]));
  }, []);

  async function handleSave() {
    if (!exportData) return;
    setMessage("");
    try {
      const r = await saveGlyphGraphPayload(exportData as unknown as Record<string, unknown>);
      setMessage(`Saved graph for “${r.char}” (${r.id})`);
      const list = await listGlyphGraphRecords();
      setSavedChars(list.chars);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleLoadServer() {
    setLoadingSaved(true);
    setMessage("");
    setBulkManualOnly(false);
    setBulkPayloadsByChar(null);
    try {
      const raw = await getGlyphGraphPayload(letter);
      if (!isGlyphExportV1(raw)) {
        setMessage("Invalid payload from server");
        return;
      }
      setExportData(raw);
      applyGlyphExportToCanvases(labCanvases(), raw, letter);
      const w = GLYPH_GRAPH_CANVAS;
      const skOk = raw.image.width === w && raw.image.height === w;
      setMessage(
        skOk
          ? `已从 API 加载「${letter}」的完整存档（拓扑 + 边像素路径）。Skeleton 由存档中的路径栅格化；Binary 仍为当前字体栅格化，便于对照字形。`
          : `已从 API 加载「${letter}」；存档尺寸 ${raw.image.width}×${raw.image.height} 与当前画布 ${w}×${w} 不一致，Skeleton 暂用字体自动细化；请用同一 256×256 流程重新保存。`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSaved(false);
    }
  }

  async function handleLoadAllManualFromApiAndResave() {
    setLoadingBulkAll(true);
    setMessage("");
    try {
      const all = await exportAllGlyphGraphPayloads();
      const byChar: Record<string, GlyphGraphExportV1> = {};
      for (const item of all) {
        if (isGlyphExportV1(item)) {
          byChar[item.char] = item;
        }
      }
      setBulkPayloadsByChar(byChar);
      setBulkManualOnly(true);

      let savedOk = 0;
      const saveErrors: string[] = [];
      for (const p of Object.values(byChar)) {
        try {
          await saveGlyphGraphPayload(p as unknown as Record<string, unknown>);
          savedOk++;
        } catch (e) {
          saveErrors.push(
            `${p.char}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      const list = await listGlyphGraphRecords();
      setSavedChars(list.chars);

      const n = Object.keys(byChar).length;
      const errTail =
        saveErrors.length > 0
          ? ` 写回失败 ${saveErrors.length} 条（示例：${saveErrors.slice(0, 2).join("；")}）`
          : "";
      setMessage(
        `已从 API 载入 ${n} 个手动标注（仅显示存档拓扑，不跑字体自动抽图）。已向 API 写回 ${savedOk} 条。${errTail} 切换 Letter 可浏览各字母；点「Recompute from font」退出此模式。`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingBulkAll(false);
    }
  }

  function handleImportJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage("");
    setBulkManualOnly(false);
    setBulkPayloadsByChar(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as unknown;
        if (!isGlyphExportV1(parsed)) {
          setMessage("JSON 不是有效的 GlyphGraphExportV1");
          return;
        }
        setExportData(parsed);
        applyGlyphExportToCanvases(labCanvases(), parsed, letter);
        const ch = parsed.char;
        const w = GLYPH_GRAPH_CANVAS;
        const skOk = parsed.image.width === w && parsed.image.height === w;
        setMessage(
          ch === letter
            ? skOk
              ? `已导入本地 JSON；Skeleton 由文件中的边像素路径栅格化；Primitive graph 与存档一致。`
              : `已导入本地 JSON；尺寸与当前画布不一致，Skeleton 用字体自动细化。`
            : `已导入 char「${ch}」的拓扑；Binary/Skeleton 仍为当前所选「${letter}」的字体。请将 Letter 改为「${ch}」以与文件对齐。`
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  }

  async function handleDownloadBatch() {
    try {
      const all = await exportAllGlyphGraphPayloads();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "glyph_graphs_export.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownloadCurrentSkeletonPng() {
    if (!exportData) return;
    setMessage("");
    try {
      const blob = await glyphExportToSkeletonPngBlob(exportData);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${exportData.char}_glyph_skeleton.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage(
        `已下载 ${exportData.char}_glyph_skeleton.png（黑底白线，供 research/glyph_shape_family/scripts/extract_features.py 使用）`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownloadAllSkeletonPngsZip() {
    setMessage("");
    setLoadingSkeletonZip(true);
    try {
      const raw = await exportAllGlyphGraphPayloads();
      const zip = new JSZip();
      let count = 0;
      for (const item of raw) {
        if (!isGlyphExportV1(item)) continue;
        const blob = await glyphExportToSkeletonPngBlob(item);
        zip.file(`${item.char}_glyph_skeleton.png`, blob);
        count++;
      }
      if (count === 0) {
        setMessage("API 中没有 glyph 存档，无法导出 PNG。");
        return;
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = "glyph_skeletons_for_extract_features.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage(`已导出 ${count} 张 skeleton PNG（ZIP）；解压到文件夹后作为 extract_features.py 的输入目录。`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSkeletonZip(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col px-4 pb-12 pt-20 text-white/90">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/25 px-3 py-1 text-sm text-white/80">
            Lowercase graph lab
          </span>
          <Link href="/" className="text-sm text-sky-400 hover:underline">
            Home
          </Link>
          <Link href="/glyph-pieces" className="text-sm text-white/60 hover:underline">
            部件编辑
          </Link>
          <Link href="/glyph-graph/edit" className="text-sm text-sky-400 hover:underline">
            Manual topology (SVG)
          </Link>
        </header>

        <p className="max-w-3xl text-sm leading-relaxed text-white/65">
          Graph-first pipeline: raster → binary → skeleton → topology graph → per-segment geometric features. Scope:{" "}
          <strong className="text-white/85">lowercase English a–z only</strong>。{" "}
          <strong className="text-white/85">保存到 API</strong>
          写入的 <code className="text-white/70">GlyphGraphExportV1</code> 是字形拓扑的权威来源（导出 / ML 均读同一份）。在{" "}
          <Link href="/glyph-graph/edit" className="text-sky-400 hover:underline">
            Manual topology
          </Link>{" "}
          保存与这里共用 API；「从 API 加载」会还原存档中的结点、边与边像素路径，Skeleton 面板显示由这些路径栅格化的骨架（不再仅用字体自动细化）。
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
            onClick={() => {
              setBulkManualOnly(false);
              setBulkPayloadsByChar(null);
              runPipeline(letter);
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
            title="退出「仅手动标注」模式，并按字体重新计算 binary / skeleton / 拓扑"
          >
            Recompute from font
          </button>
          <button
            type="button"
            onClick={handleLoadServer}
            disabled={loadingSaved || loadingBulkAll}
            className="rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            title="与 Manual topology 页「保存到 API」写入同一条记录"
          >
            从 API 加载（含手动标注）
          </button>
          <button
            type="button"
            onClick={handleLoadAllManualFromApiAndResave}
            disabled={loadingBulkAll || loadingSaved}
            className="rounded-lg border border-violet-400/40 px-4 py-2 text-sm hover:bg-violet-500/15 disabled:opacity-50"
            title="GET export/all：仅用手动存档刷新界面，并对每条 POST 写回 API（与 ML 导出同源）"
          >
            {loadingBulkAll ? "加载并写回中…" : "加载全部手动标注并写回 API"}
          </button>
          <label className="cursor-pointer rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10">
            导入 JSON 文件
            <input type="file" accept=".json,application/json" className="sr-only" onChange={handleImportJsonFile} />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={!exportData}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
          >
            Save graph to API
          </button>
          <button
            type="button"
            onClick={handleDownloadBatch}
            className="rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10"
          >
            Download all saved (JSON)
          </button>
          <button
            type="button"
            onClick={handleDownloadCurrentSkeletonPng}
            disabled={!exportData}
            className="rounded-lg border border-emerald-500/50 px-4 py-2 text-sm text-emerald-200/95 hover:bg-emerald-500/15 disabled:opacity-50"
            title="黑底白线 PNG，文件名形如 a_glyph_skeleton.png，与 extract_features.py 默认 label 正则兼容"
          >
            下载当前 skeleton PNG
          </button>
          <button
            type="button"
            onClick={handleDownloadAllSkeletonPngsZip}
            disabled={loadingSkeletonZip || loadingBulkAll}
            className="rounded-lg border border-emerald-500/50 px-4 py-2 text-sm text-emerald-200/95 hover:bg-emerald-500/15 disabled:opacity-50"
            title="GET export/all，每张存档生成 PNG，打包为 ZIP；解压后整目录作为 extract_features 输入"
          >
            {loadingSkeletonZip ? "打包 PNG…" : "下载全部 skeleton PNG（ZIP）"}
          </button>
        </div>

        {message && <p className="text-sm text-amber-200/90">{message}</p>}

        {bulkManualOnly && (
          <p className="text-xs text-violet-200/90">
            当前为「仅手动标注」模式：Skeleton / Primitive graph 仅来自 API 存档，未运行字体自动拓扑提取。切换 Letter
            浏览已存档字母；无存档的字母画布为空。
          </p>
        )}

        <p className="text-xs text-white/45">
          ★ = first experiment set (b,d,p,q,h,n,m,v,w,x). Saved letters on server:{" "}
          {savedChars.length ? savedChars.join(", ") : "none"}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/15 bg-[#12121a] p-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">Binary</h3>
            <canvas ref={refBinary} width={GLYPH_GRAPH_CANVAS} height={GLYPH_GRAPH_CANVAS} className="max-w-full rounded border border-white/10" />
          </div>
          <div className="rounded-xl border border-white/15 bg-[#12121a] p-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">Skeleton</h3>
            <canvas ref={refSk} width={GLYPH_GRAPH_CANVAS} height={GLYPH_GRAPH_CANVAS} className="max-w-full rounded border border-white/10" />
          </div>
          <div className="rounded-xl border border-white/15 bg-[#12121a] p-3 md:col-span-2">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">
              Primitive graph (topology + colored segments)
            </h3>
            <canvas ref={refGraph} width={GLYPH_GRAPH_CANVAS} height={GLYPH_GRAPH_CANVAS} className="max-w-full rounded border border-white/10" />
          </div>
        </div>

        <div className="rounded-xl border border-white/15 bg-[#12121a] p-4">
          <h3 className="mb-2 text-sm font-medium text-white/80">Node / segment features (JSON)</h3>
          <pre className="max-h-[420px] overflow-auto text-xs leading-relaxed text-emerald-200/80">
            {exportData ? JSON.stringify(exportData, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
