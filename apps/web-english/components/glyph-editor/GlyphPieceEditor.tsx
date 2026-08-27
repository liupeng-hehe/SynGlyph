"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { centerGlyphRasterInImageData, runPreprocess } from "@/lib/glyph-editor/preprocess";
import {
  pixelClipFromNormCorners,
  segmentGlyphByLineCuts,
  snapNearlyVerticalToColumn,
} from "@/lib/glyph-editor/glyphSegmentation";
import {
  buildPieceAnnotations,
  inferSpatialRelations,
  mergeLoadedAnnotations,
  mergePieceAnnotations,
} from "@/lib/glyph-editor/glyphGeometry";
import { clientToViewBoxFloat, clientToViewBoxPixel } from "@/lib/glyph-editor/viewBoxCoords";
import type { GlyphAnnotationDocumentV2, LineCutV2, PieceAnnotationV2 } from "@/lib/glyph-editor/glyphSchema";
import { listGlyphSegmentGlyphs, saveGlyphSegmentDocument } from "@/lib/api";
import { GlyphCanvas } from "./GlyphCanvas";
import { PieceOverlay } from "./PieceOverlay";
import { PieceInspector } from "./PieceInspector";
import { FourConnectivityDiagram } from "./FourConnectivityDiagram";
import { DEFAULT_CUT_THICKNESS_PX, pixelToNormPoint } from "./CutLineTool";

const CANVAS = 256;
/** 小写拉丁字母 a–z，字母表顺序 */
const LATIN_LETTERS_LOWER = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
const MIN_CUT_LEN_PX = 6;
const MIN_SCOPE_PX = 4;
const MAX_UNDO = 50;

const LS_KEY = (g: string) => `synglyph.glyphPieceEditor.v2.${g}`;

type EditorUndoSnapshot = {
  cuts: LineCutV2[];
  pieces: PieceAnnotationV2[];
  activeClipNorm: [[number, number], [number, number]] | null;
  /** 竖向切割不挖穿此矩形内的前景（横笔保护） */
  protectedStripNorm: [[number, number], [number, number]] | null;
  gridShow: boolean;
};

function loadDraft(glyph: string): GlyphAnnotationDocumentV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY(glyph));
    if (!raw) return null;
    const doc = JSON.parse(raw) as GlyphAnnotationDocumentV2;
    if (doc.version !== 2) return null;
    return doc;
  } catch {
    return null;
  }
}

function renderLetterToImageData(ch: string, size = CANVAS): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.floor(size * 0.72)}px system-ui, sans-serif`;
  ctx.fillText(ch, size / 2, size / 2);
  const raw = ctx.getImageData(0, 0, size, size);
  return centerGlyphRasterInImageData(raw);
}

function bboxBinary(bin: Uint8Array, w: number, h: number): [number, number, number, number] {
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX > maxX) return [0, 0, w - 1, h - 1];
  return [minX, minY, maxX, maxY];
}

function imageDataToUrl(data: ImageData): string {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  c.getContext("2d")!.putImageData(data, 0, 0);
  return c.toDataURL();
}

function hitPiece(
  px: number,
  py: number,
  label: Int32Array,
  w: number,
  h: number,
  nComp: number,
  offsets: Record<string, { dx: number; dy: number }>
): string | null {
  for (let i = nComp - 1; i >= 0; i--) {
    const pid = `p${i}`;
    const off = offsets[pid];
    const dx = off ? Math.round(off.dx * w) : 0;
    const dy = off ? Math.round(off.dy * h) : 0;
    const sx = px - dx;
    const sy = py - dy;
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
    if (label[sy * w + sx] === i) return pid;
  }
  return null;
}

type InteractionMode = "cut" | "select";

type Props = {
  initialGlyph?: string;
};

function normalizeInitialGlyph(g: string): string {
  const t = g.trim().toLowerCase();
  return LATIN_LETTERS_LOWER.includes(t) ? t : "a";
}

export function GlyphPieceEditor({ initialGlyph = "a" }: Props) {
  const [glyph, setGlyph] = useState(() => normalizeInitialGlyph(initialGlyph));
  const [pre, setPre] = useState<ReturnType<typeof runPreprocess> | null>(null);
  const [cuts, setCuts] = useState<LineCutV2[]>([]);
  const [pieces, setPieces] = useState<PieceAnnotationV2[]>([]);
  const piecesRef = useRef<PieceAnnotationV2[]>([]);
  piecesRef.current = pieces;
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;

  const [interactionMode, setInteractionMode] = useState<InteractionMode>("cut");
  const [explodedView, setExplodedView] = useState(true);
  const [gridShow, setGridShow] = useState(true);
  /** 下一刀切割带全宽（像素），写入每条 LineCutV2.thickness */
  const [cutThicknessPx, setCutThicknessPx] = useState(DEFAULT_CUT_THICKNESS_PX);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [segmentScript, setSegmentScript] = useState<"en" | "zh">("en");
  const [saveUi, setSaveUi] = useState<{
    status: "idle" | "saving" | "ok" | "err";
    message: string | null;
  }>({ status: "idle", message: null });
  const [savedGlyphIds, setSavedGlyphIds] = useState<string[]>([]);

  const savedGlyphSet = useMemo(() => new Set(savedGlyphIds), [savedGlyphIds]);

  const refreshSavedGlyphs = useCallback(async () => {
    const list = await listGlyphSegmentGlyphs(segmentScript);
    setSavedGlyphIds(list);
  }, [segmentScript]);

  useEffect(() => {
    void refreshSavedGlyphs();
  }, [refreshSavedGlyphs]);

  const [draftLine, setDraftLine] = useState<[[number, number], [number, number]] | null>(null);
  const drawRef = useRef<{ active: boolean }>({ active: false });
  /** ⌘/Ctrl + drag: normalized opposite corners of scope rect (while dragging). */
  const [draftScopeNorm, setDraftScopeNorm] = useState<[[number, number], [number, number]] | null>(null);
  /** Applied to the next cut line(s) until cleared. */
  const [activeClipNorm, setActiveClipNorm] = useState<[[number, number], [number, number]] | null>(null);
  /** 竖切经过此带时保留横笔像素（需先框住横笔条带，再画竖线） */
  const [protectedStripNorm, setProtectedStripNorm] = useState<[[number, number], [number, number]] | null>(null);
  const activeClipNormRef = useRef(activeClipNorm);
  activeClipNormRef.current = activeClipNorm;
  const protectedStripNormRef = useRef(protectedStripNorm);
  protectedStripNormRef.current = protectedStripNorm;
  const gridShowRef = useRef(gridShow);
  gridShowRef.current = gridShow;
  const scopeDrawRef = useRef<{ active: boolean }>({ active: false });
  const [draftProtectNorm, setDraftProtectNorm] = useState<[[number, number], [number, number]] | null>(null);
  const protectDrawRef = useRef<{ active: boolean }>({ active: false });

  const undoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const redoStackRef = useRef<EditorUndoSnapshot[]>([]);

  const cloneEditorState = useCallback((): EditorUndoSnapshot => {
    return JSON.parse(
      JSON.stringify({
        cuts: cutsRef.current,
        pieces: piecesRef.current,
        activeClipNorm: activeClipNormRef.current,
        protectedStripNorm: protectedStripNormRef.current,
        gridShow: gridShowRef.current,
      })
    ) as EditorUndoSnapshot;
  }, []);

  const applySnapshot = useCallback((s: EditorUndoSnapshot) => {
    setCuts(s.cuts);
    setPieces(s.pieces);
    setActiveClipNorm(s.activeClipNorm);
    setProtectedStripNorm(s.protectedStripNorm ?? null);
    setGridShow(s.gridShow);
  }, []);

  const pushHistory = useCallback(() => {
    undoStackRef.current.push(cloneEditorState());
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, [cloneEditorState]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    redoStackRef.current.push(cloneEditorState());
    const prev = undoStackRef.current.pop()!;
    applySnapshot(prev);
  }, [cloneEditorState, applySnapshot]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    undoStackRef.current.push(cloneEditorState());
    const next = redoStackRef.current.pop()!;
    applySnapshot(next);
  }, [cloneEditorState, applySnapshot]);

  const dragRef = useRef<{
    pieceId: string;
    lastFx: number;
    lastFy: number;
  } | null>(null);

  const queueLoadRef = useRef<GlyphAnnotationDocumentV2 | null>(null);
  const pendingPiecesRef = useRef<PieceAnnotationV2[] | null>(null);
  const draftOnGlyphChangeRef = useRef<GlyphAnnotationDocumentV2 | null>(null);
  const prevGlyphRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isGlyphChange = prevGlyphRef.current !== glyph;
    prevGlyphRef.current = glyph;
    if (!isGlyphChange) return;
    const imageData = renderLetterToImageData(glyph);
    setPre(runPreprocess(imageData, { useLargestComponent: false }));
    const draft = queueLoadRef.current ? null : loadDraft(glyph);
    draftOnGlyphChangeRef.current = draft;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCuts([]);
    setProtectedStripNorm(null);
    pendingPiecesRef.current = null;
    setSelectedPieceId(null);
  }, [glyph]);

  useEffect(() => {
    setSaveUi({ status: "idle", message: null });
  }, [glyph, segmentScript]);

  useEffect(() => {
    if (!pre) return;
    const draft = draftOnGlyphChangeRef.current;
    if (
      draft &&
      draft.glyph === glyph &&
      draft.image_width === pre.width &&
      draft.image_height === pre.height
    ) {
      draftOnGlyphChangeRef.current = null;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCuts(draft.cuts);
      setGridShow(draft.grid?.show ?? true);
      pendingPiecesRef.current = draft.pieces;
    }
  }, [pre, glyph]);

  const w = pre?.width ?? CANVAS;
  const h = pre?.height ?? CANVAS;

  const glyphBboxNorm = useMemo(() => {
    if (!pre) return [0, 0, 1, 1] as [number, number, number, number];
    const [bx0, by0, bx1, by1] = bboxBinary(pre.binary, pre.width, pre.height);
    const gw = Math.max(1, pre.width - 1),
      gh = Math.max(1, pre.height - 1);
    return [bx0 / gw, by0 / gh, bx1 / gw, by1 / gh] as [number, number, number, number];
  }, [pre]);

  const cutsForSeg = useMemo(() => {
    return cuts.map((c) => ({
      ax: c.points[0][0] * Math.max(1, w - 1),
      ay: c.points[0][1] * Math.max(1, h - 1),
      bx: c.points[1][0] * Math.max(1, w - 1),
      by: c.points[1][1] * Math.max(1, h - 1),
      halfWidth: c.thickness / 2,
      clip: c.clip_norm ? pixelClipFromNormCorners(c.clip_norm, w, h) : undefined,
    }));
  }, [cuts, w, h]);

  const cutsLayoutOnly = useMemo(
    () => cutsForSeg.map(({ ax, ay, bx, by }) => ({ ax, ay, bx, by })),
    [cutsForSeg]
  );

  const segmentation = useMemo(() => {
    if (!pre) return null;
    const prot = protectedStripNorm ? pixelClipFromNormCorners(protectedStripNorm, w, h) : undefined;
    return segmentGlyphByLineCuts(
      pre.binary,
      w,
      h,
      cutsForSeg,
      prot ? { verticalStripProtected: prot } : undefined
    );
  }, [pre, w, h, cutsForSeg, protectedStripNorm]);

  useEffect(() => {
    if (!pre || !segmentation) return;
    const { components } = segmentation;
    if (components.length === 0) {
      setPieces([]);
      return;
    }
    const fresh = buildPieceAnnotations(components, pre.binary, w, h, glyphBboxNorm, cutsLayoutOnly);
    const pending = pendingPiecesRef.current;
    if (pending) {
      pendingPiecesRef.current = null;
      setPieces(mergeLoadedAnnotations(pending, fresh));
      return;
    }
    setPieces(mergePieceAnnotations(piecesRef.current, fresh));
  }, [segmentation, pre, w, h, glyphBboxNorm, cutsLayoutOnly]);

  useEffect(() => {
    if (!pre || !queueLoadRef.current) return;
    const doc = queueLoadRef.current;
    if (doc.glyph !== glyph) return;
    queueLoadRef.current = null;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCuts(doc.cuts);
    setGridShow(doc.grid?.show ?? true);
    pendingPiecesRef.current = doc.pieces;
  }, [pre, glyph]);

  const letterDataUrl = useMemo(() => {
    if (typeof document === "undefined" || !pre) return "";
    return imageDataToUrl(renderLetterToImageData(glyph, pre.width));
  }, [glyph, pre]);

  const offsets = useMemo(() => {
    const o: Record<string, { dx: number; dy: number }> = {};
    for (const p of pieces) {
      o[p.piece_id] = { dx: p.offset_dx, dy: p.offset_dy };
    }
    return o;
  }, [pieces]);

  const stackRef = useRef<HTMLDivElement>(null);

  const updatePiece = useCallback(
    (p: PieceAnnotationV2) => {
      pushHistory();
      setPieces((list) => list.map((x) => (x.piece_id === p.piece_id ? p : x)));
    },
    [pushHistory]
  );

  const resetExploded = useCallback(() => {
    pushHistory();
    setPieces((list) =>
      list.map((p) => ({
        ...p,
        offset_dx: 0,
        offset_dy: 0,
        exploded_centroid: [p.original_centroid[0], p.original_centroid[1]],
      }))
    );
  }, [pushHistory]);

  const buildDoc = useCallback((): GlyphAnnotationDocumentV2 => {
    if (!pre) {
      return {
        version: 2,
        glyph,
        bbox: [0, 0, 1, 1],
        grid: { show: gridShow },
        image_width: CANVAS,
        image_height: CANVAS,
        cuts: [],
        pieces: [],
        relations: [],
      };
    }
    return {
      version: 2,
      glyph,
      bbox: glyphBboxNorm,
      grid: { show: gridShow },
      image_width: pre.width,
      image_height: pre.height,
      cuts,
      pieces,
      relations: inferSpatialRelations(pieces),
    };
  }, [pre, glyph, gridShow, glyphBboxNorm, cuts, pieces]);

  const downloadJson = useCallback(() => {
    const doc = buildDoc();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `glyph-${glyph}-annotation-v2.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [buildDoc, glyph]);

  const saveToProject = useCallback(async () => {
    setSaveUi({ status: "saving", message: null });
    try {
      const doc = buildDoc();
      const r = await saveGlyphSegmentDocument(
        JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
        segmentScript
      );
      setSaveUi({ status: "ok", message: r.path });
      await refreshSavedGlyphs();
    } catch (e) {
      setSaveUi({
        status: "err",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [buildDoc, segmentScript, refreshSavedGlyphs]);

  useEffect(() => {
    if (!pre) return;
    const t = window.setTimeout(() => {
      try {
        const doc = buildDoc();
        localStorage.setItem(LS_KEY(glyph), JSON.stringify(doc));
      } catch {
        /* quota */
      }
    }, 480);
    return () => clearTimeout(t);
  }, [glyph, cuts, pieces, gridShow, pre, buildDoc]);

  useEffect(() => {
    if (!pre) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"))
        return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pre, undo, redo]);

  const loadJson = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const doc = JSON.parse(String(r.result)) as GlyphAnnotationDocumentV2;
        if (doc.version !== 2) {
          alert("Expected annotation JSON version 2");
          return;
        }
        queueLoadRef.current = doc;
        draftOnGlyphChangeRef.current = null;
        const ng = normalizeInitialGlyph(doc.glyph);
        if (ng !== glyph) setGlyph(ng);
        else {
          undoStackRef.current = [];
          redoStackRef.current = [];
          setCuts(doc.cuts);
          setGridShow(doc.grid?.show ?? true);
          pendingPiecesRef.current = doc.pieces;
        }
      } catch {
        alert("Invalid JSON");
      }
    };
    r.readAsText(file);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pre || !segmentation || !stackRef.current) return;
    const rect = stackRef.current.getBoundingClientRect();
    const { px, py, insideViewBox } = clientToViewBoxPixel(e.clientX, e.clientY, rect, w, h);
    if (!insideViewBox) return;

    if (interactionMode === "cut") {
      const n = pixelToNormPoint(px, py, w, h);
      if ((e.metaKey || e.ctrlKey) && e.altKey) {
        protectDrawRef.current = { active: true };
        scopeDrawRef.current = { active: false };
        drawRef.current = { active: false };
        setDraftLine(null);
        setDraftScopeNorm(null);
        setDraftProtectNorm([n, n]);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        scopeDrawRef.current = { active: true };
        protectDrawRef.current = { active: false };
        drawRef.current = { active: false };
        setDraftLine(null);
        setDraftProtectNorm(null);
        setDraftScopeNorm([n, n]);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      drawRef.current = { active: true };
      setDraftScopeNorm(null);
      setDraftProtectNorm(null);
      setDraftLine([n, n]);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (interactionMode === "select") {
      const hit = hitPiece(px, py, segmentation.label, w, h, segmentation.nComp, offsets);
      if (hit) {
        setSelectedPieceId(hit);
        if (explodedView) {
          pushHistory();
          const { fx, fy } = clientToViewBoxFloat(e.clientX, e.clientY, rect, w, h);
          dragRef.current = { pieceId: hit, lastFx: fx, lastFy: fy };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } else {
        setSelectedPieceId(null);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pre || !segmentation || !stackRef.current) return;
    const rect = stackRef.current.getBoundingClientRect();
    const { fx, fy } = clientToViewBoxFloat(e.clientX, e.clientY, rect, w, h);

    const drag = dragRef.current;
    if (drag && explodedView && interactionMode === "select") {
      const dnx = (fx - drag.lastFx) / w;
      const dny = (fy - drag.lastFy) / h;
      dragRef.current = { ...drag, lastFx: fx, lastFy: fy };
      setPieces((list) =>
        list.map((p) => {
          if (p.piece_id !== drag.pieceId) return p;
          const odx = p.offset_dx + dnx;
          const ody = p.offset_dy + dny;
          return {
            ...p,
            offset_dx: odx,
            offset_dy: ody,
            exploded_centroid: [p.original_centroid[0] + odx, p.original_centroid[1] + ody],
          };
        })
      );
      return;
    }

    const { px, py } = clientToViewBoxPixel(e.clientX, e.clientY, rect, w, h);

    if (protectDrawRef.current.active && draftProtectNorm) {
      const n = pixelToNormPoint(px, py, w, h);
      setDraftProtectNorm([draftProtectNorm[0], n]);
      return;
    }

    if (scopeDrawRef.current.active && draftScopeNorm) {
      const n = pixelToNormPoint(px, py, w, h);
      setDraftScopeNorm([draftScopeNorm[0], n]);
      return;
    }

    if (drawRef.current.active && draftLine) {
      const n = pixelToNormPoint(px, py, w, h);
      setDraftLine([draftLine[0], n]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (protectDrawRef.current.active && pre && draftProtectNorm) {
      protectDrawRef.current = { active: false };
      const [a, b] = draftProtectNorm;
      const ax = a[0] * Math.max(1, w - 1),
        ay = a[1] * Math.max(1, h - 1),
        bx = b[0] * Math.max(1, w - 1),
        by = b[1] * Math.max(1, h - 1);
      const nw = Math.abs(bx - ax);
      const nh = Math.abs(by - ay);
      setDraftProtectNorm(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (nw >= MIN_SCOPE_PX && nh >= MIN_SCOPE_PX) {
        pushHistory();
        setProtectedStripNorm([a, b]);
      }
      return;
    }

    if (scopeDrawRef.current.active && pre && draftScopeNorm) {
      scopeDrawRef.current = { active: false };
      const [a, b] = draftScopeNorm;
      const ax = a[0] * Math.max(1, w - 1),
        ay = a[1] * Math.max(1, h - 1),
        bx = b[0] * Math.max(1, w - 1),
        by = b[1] * Math.max(1, h - 1);
      const nw = Math.abs(bx - ax);
      const nh = Math.abs(by - ay);
      setDraftScopeNorm(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (nw >= MIN_SCOPE_PX && nh >= MIN_SCOPE_PX) {
        setActiveClipNorm([a, b]);
      }
      return;
    }

    if (drawRef.current.active && pre && draftLine) {
      drawRef.current = { active: false };
      const [a, b] = draftLine;
      const ax = a[0] * Math.max(1, w - 1),
        ay = a[1] * Math.max(1, h - 1),
        bx = b[0] * Math.max(1, w - 1),
        by = b[1] * Math.max(1, h - 1);
      const len = Math.hypot(bx - ax, by - ay);
      setDraftLine(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (len >= MIN_CUT_LEN_PX) {
        pushHistory();
        const snapped = snapNearlyVerticalToColumn(ax, ay, bx, by, w, h);
        const pa = pixelToNormPoint(snapped.ax, snapped.ay, w, h);
        const pb = pixelToNormPoint(snapped.bx, snapped.by, w, h);
        const clipNorm = activeClipNorm;
        const cut: LineCutV2 = {
          cut_id: `c${Date.now()}`,
          type: "line",
          points: [pa, pb],
          thickness: cutThicknessPx,
          created_by_user: true,
          ...(clipNorm ? { clip_norm: clipNorm } : {}),
        };
        setCuts((c) => [...c, cut]);
      }
      return;
    }

    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!pre || !segmentation) {
    return <div className="p-4 text-zinc-400">加载字形…</div>;
  }

  const nComp = segmentation.nComp;

  return (
    <div className="flex flex-col gap-4 text-zinc-200 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-700 pb-3">
          <label className="text-sm text-zinc-400">字母 (a–z)</label>
          <select
            value={glyph}
            onChange={(e) => setGlyph(e.target.value)}
            className="min-w-[8.5rem] rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-zinc-100 [&>option]:bg-zinc-900"
            title="按字母表顺序；✓ 已保存 表示当前目录下已有该字母的 JSON"
          >
            {LATIN_LETTERS_LOWER.map((c) => (
              <option key={c} value={c}>
                {savedGlyphSet.has(c) ? `${c}  ·  已保存` : c}
              </option>
            ))}
          </select>
          <label className="text-sm text-zinc-400">分割语系目录</label>
          <select
            value={segmentScript}
            onChange={(e) => setSegmentScript(e.target.value as "en" | "zh")}
            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-zinc-100 [&>option]:bg-zinc-900"
            title="写入 data/glyph_segments/en/ 或 zh/"
          >
            <option value="en">拉丁等 → en/</option>
            <option value="zh">汉字 → zh/</option>
          </select>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-sm ${
              interactionMode === "cut"
                ? "border-sky-500 bg-sky-500/20 text-sky-200"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            }`}
            onClick={() => setInteractionMode("cut")}
          >
            切割模式
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-sm ${
              interactionMode === "select"
                ? "border-sky-500 bg-sky-500/20 text-sky-200"
                : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            }`}
            onClick={() => setInteractionMode("select")}
          >
            选择 / 拖动
          </button>
          <label className="flex cursor-pointer items-center gap-1 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={explodedView}
              onChange={(e) => setExplodedView(e.target.checked)}
              className="accent-sky-500"
            />
            分解视图
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={gridShow}
              onChange={(e) => setGridShow(e.target.checked)}
              className="accent-sky-500"
            />
            参考格
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-400" title="只影响接下来新画的切割；带宽以线段为中心向两侧扩展">
            <span className="whitespace-nowrap">切割厚度</span>
            <input
              type="range"
              min={2}
              max={16}
              step={1}
              value={cutThicknessPx}
              onChange={(e) => setCutThicknessPx(Number(e.target.value))}
              className="h-2 w-[5.5rem] cursor-pointer accent-sky-500"
            />
            <span className="min-w-[2.25rem] tabular-nums text-zinc-300">{cutThicknessPx}px</span>
          </label>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={() => {
              pushHistory();
              setCuts([]);
              setActiveClipNorm(null);
              setProtectedStripNorm(null);
            }}
          >
            清除切割
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-sm ${
              activeClipNorm
                ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                : "border-zinc-600 text-zinc-500"
            }`}
            disabled={!activeClipNorm}
            onClick={() => setActiveClipNorm(null)}
            title="清除当前切割作用域（不影响已画好的切割线）"
          >
            清除作用域
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-1 text-sm ${
              protectedStripNorm
                ? "border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-200"
                : "border-zinc-600 text-zinc-500"
            }`}
            disabled={!protectedStripNorm}
            onClick={() => {
              pushHistory();
              setProtectedStripNorm(null);
            }}
            title="清除横笔保护框（竖向切割会重新可能挖断横笔）"
          >
            清除横笔保护
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={resetExploded}
          >
            重置分解位置
          </button>
          <button
            type="button"
            className="rounded border border-emerald-600 bg-emerald-600/20 px-2 py-1 text-sm text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
            onClick={() => void saveToProject()}
            disabled={saveUi.status === "saving"}
          >
            {saveUi.status === "saving" ? "写入中…" : "保存到项目"}
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={downloadJson}
            title="下载到本机，便于离线备份"
          >
            下载 JSON
          </button>
          <label className="cursor-pointer rounded border border-zinc-600 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800">
            加载 JSON
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])}
            />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">
          <strong className="text-zinc-300">字形位置</strong>
          ：系统字绘制后会按<strong className="text-zinc-300">前景像素外接矩形</strong>（最大连通域）的几何中心平移到画布中心，与田字格中线交点对齐（适合带 descender 的 g、p 等）。
          <strong className="text-zinc-300">切割</strong>：在掩码上挖<strong className="text-zinc-300">以你画的线段为中心</strong>的带状空隙（厚度见上方滑块），竖线会<strong className="text-zinc-300">对齐到一列</strong>、但
          <strong className="text-zinc-300">只覆盖你画的长度</strong>，不会拉满整幅。若某处仍切不开，请把线画长、或<strong className="text-zinc-300">加大切割厚度</strong>。
          <strong className="text-zinc-300"> y / v 等凹笔</strong>：一刀斜线若只蹭到内角会出现黑缝但仍一块；要分开需<strong className="text-zinc-300">加宽切割带</strong>或<strong className="text-zinc-300">补刀</strong>，直到所有绕开缺口的连通路径都被挖断。
          <span className="mt-2 flex flex-wrap items-start gap-4 rounded border border-zinc-700/90 bg-zinc-900/40 p-3">
            <FourConnectivityDiagram />
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-400">
              <strong className="text-zinc-300">4-连通分块</strong>
              ：前景像素只有<strong className="text-zinc-300">上下左右共边</strong>才算同一块；对角仅角碰角则<strong className="text-zinc-300">不算</strong>连通。切割出的缝若四周仍有「绕路」可走，笔画就还是一块。
            </span>
          </span>
          <strong className="text-zinc-300">作用域</strong>：切割模式下按住 <strong className="text-zinc-300">⌘（Mac）或 Ctrl（Win）</strong>
          拖拽矩形，<strong className="text-zinc-300">只有「矩形 ∩ 切割线带状区域」里的笔画会被挖掉</strong>；矩形外的笔画不受影响。
          <span className="block pt-1 text-zinc-500">
            <strong className="text-zinc-400">作用域不是「复制图层」</strong>，只是限制切割挖断的范围；竖切仍会挖穿矩形里的横笔像素。
            <strong className="text-zinc-400">横笔保护（推荐）</strong>：切割模式下按住 <strong className="text-zinc-300">⌥+⌘（Mac）或 Alt+Ctrl（Win）</strong>
            拖拽<strong className="text-zinc-400">品红虚线框</strong>，框住<strong className="text-zinc-400">整条横笔</strong>（上下略多留一点）。生效后，所有<strong className="text-zinc-400">竖向切割带</strong>经过该框时<strong className="text-zinc-400">不会擦掉框内前景</strong>，横笔左右保持一条连通；再在竖笔两侧画竖线即可分开左右，而不会把横笔切成多块。
            <span className="block pt-0.5">
              典型顺序：<strong className="text-zinc-400">①</strong> 用两条<strong className="text-zinc-400">横向切割</strong>把上弯、中间带、下竖分开；<strong className="text-zinc-400">②</strong> ⌥+⌘ 拖出横笔保护框；<strong className="text-zinc-400">③</strong> 在中间带里画<strong className="text-zinc-400">竖线</strong>拆竖笔。
              同一交叉像素不能同时标成两个部件（无「图层叠放」）；若要表达横竖重叠，只能靠分解视图里的接缝补色，或导出后在别处标注。
            </span>
          </span>
          <strong className="text-zinc-300">选择</strong>：点选部件；打开<strong className="text-zinc-300">分解视图</strong>
          后可拖动；接缝缝隙会在相邻部件上各补一层半透明色，避免拉开后出现空洞。
          <strong className="text-zinc-300">撤销 / 重做</strong>：<strong className="text-zinc-300">⌘/Ctrl+Z</strong> 撤销，<strong className="text-zinc-300">⌘/Ctrl+Shift+Z</strong> 或 <strong className="text-zinc-300">Ctrl+Y</strong> 重做（输入框内不拦截）。
          <span className="block pt-1 text-zinc-500">
            当前字母的草稿会<strong>自动写入本机 localStorage</strong>。长期保存请点<strong>保存到项目</strong>（需本地 API，写入仓库{" "}
            <code className="rounded bg-zinc-800 px-0.5 text-zinc-300">data/glyph_segments/&lt;en|zh&gt;/&lt;字&gt;.json</code>
            ）；也可「下载 JSON」离线备份。
          </span>
          {saveUi.status === "ok" && saveUi.message && (
            <span className="mt-1 block text-xs text-emerald-400">已保存：{saveUi.message}</span>
          )}
          {saveUi.status === "err" && saveUi.message && (
            <span className="mt-1 block text-xs text-red-400">保存失败：{saveUi.message}</span>
          )}
        </p>
        <div
          ref={stackRef}
          className="relative inline-block w-full max-h-[75vh]"
          style={{
            aspectRatio: `${w} / ${h}`,
            cursor: interactionMode === "cut" ? "crosshair" : explodedView ? "grab" : "default",
            touchAction: "none",
          }}
        >
          <GlyphCanvas
            width={w}
            height={h}
            showGrid={gridShow}
            letterDataUrl={letterDataUrl}
            showLetter
            cuts={cuts}
            draftLine={draftLine}
            draftScopeNorm={draftScopeNorm}
            activeClipNorm={activeClipNorm}
            draftProtectNorm={draftProtectNorm}
            protectedStripNorm={protectedStripNorm}
            pieceLayer={
              nComp > 0 ? (
                <PieceOverlay
                  width={w}
                  height={h}
                  label={segmentation.label}
                  nComp={nComp}
                  offsets={offsets}
                  explodedView={explodedView}
                  selectedPieceId={selectedPieceId}
                />
              ) : (
                <div className="text-xs text-zinc-500">无前景部件（尝试减少切割）</div>
              )
            }
          />
          <div
            className="pointer-events-auto absolute inset-0 z-[4]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={(e) => {
              if (drawRef.current.active) {
                drawRef.current = { active: false };
                setDraftLine(null);
              }
              if (scopeDrawRef.current.active) {
                scopeDrawRef.current = { active: false };
                setDraftScopeNorm(null);
              }
              if (protectDrawRef.current.active) {
                protectDrawRef.current = { active: false };
                setDraftProtectNorm(null);
              }
              dragRef.current = null;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      </div>
      <div className="w-full shrink-0 space-y-3 lg:w-80">
        <PieceInspector
          piece={pieces.find((p) => p.piece_id === selectedPieceId) ?? null}
          onChange={updatePiece}
        />
        <div className="rounded border border-zinc-700 bg-zinc-900/80 p-3 font-mono text-[10px] text-zinc-400">
          <div className="mb-1 font-sans text-xs font-medium text-zinc-200">状态</div>
          <div>
            画布: {w}×{h}
          </div>
          <div>部件数: {nComp}</div>
          <div>切割线数: {cuts.length}</div>
        </div>
      </div>
    </div>
  );
}
