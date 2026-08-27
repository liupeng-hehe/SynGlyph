"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { labToHex } from "@synglyph/shared";
import { predictLetterSequenceText } from "@/lib/api";
import {
  BASE_GREY,
  FONT_FAMILY,
  POINTER_SMOOTH,
  type G,
  type RGB,
  buildCharMap,
  ensureCanvas,
  hexToRgb,
  hitTestGlyphIndex,
  layoutLineWrap,
  punchRgbForDisplay,
  smoothLetterLabs,
  wordCharRangeAt,
} from "@/lib/textRevealCanvasUtils";
import { mapPForRender, mapSForRender } from "@/lib/textRevealPreviewEditorMap";
import { clamp01, visualStyleFromPxS } from "@/lib/textRevealPxSVisual";

const CANVAS_BG = "#f5f7fb";
const LAB_BLEND = 0.12;
const SOFTEN_BLUR = 0.48;
const GRAIN_ALPHA = 0.06;

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function PreviewPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sharpRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);

  const [inputText, setInputText] = useState("synesthesia");
  const debouncedText = useDebounce(inputText, 600);

  const [size, setSize] = useState({ w: 800, h: 400 });
  const [dpr, setDpr] = useState(1);
  const ptrRef = useRef({ x: 0, y: 0 });
  const targetPtrRef = useRef({ x: 0, y: 0 });
  const followRafRef = useRef<number | null>(null);
  const [hovering, setHovering] = useState(false);

  const [predLab, setPredLab] = useState<[number, number, number][] | null>(null);
  const [predProm, setPredProm] = useState<number[] | null>(null);
  const [predSpread, setPredSpread] = useState<number[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [hoverChar, setHoverChar] = useState<{ ch: string; hex: string } | null>(null);

  const grainBufRef = useRef<{ w: number; h: number; canvas: HTMLCanvasElement } | null>(null);
  const ensureGrain = useCallback((physW: number, physH: number) => {
    const prev = grainBufRef.current;
    if (prev && prev.w === physW && prev.h === physH) return prev.canvas;
    const c = document.createElement("canvas");
    c.width = physW; c.height = physH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const id = ctx.createImageData(physW, physH);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 118 + (Math.random() - 0.5) * 95;
      id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 44;
    }
    ctx.putImageData(id, 0, 0);
    grainBufRef.current = { w: physW, h: physH, canvas: c };
    return c;
  }, []);

  const fontSizePx = useMemo(() => Math.min(48, Math.max(20, size.w * 0.04)), [size.w]);
  const maxWidth = useMemo(() => Math.max(200, size.w - 80), [size.w]);
  const font = `600 ${fontSizePx}px ${FONT_FAMILY}`;

  const displayText = debouncedText.trim() || "synesthesia";

  const glyphs = useMemo<G[]>(() => {
    if (typeof document === "undefined") return [];
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = font;
    const measure = (ch: string) => ctx.measureText(ch).width;
    const lineHeight = fontSizePx * 1.35;
    const raw = layoutLineWrap(displayText, maxWidth, fontSizePx, lineHeight, measure);
    let maxY = 0;
    for (const g of raw) maxY = Math.max(maxY, g.y);
    const th = maxY + fontSizePx * 0.4;
    const pX = Math.max(32, (size.w - maxWidth) / 2);
    const pY = Math.max(56, (size.h - th) / 2);
    return raw.map((g) => ({ ...g, x: g.x + pX, y: g.y + pY }));
  }, [displayText, maxWidth, font, fontSizePx, size]);

  const charMap = useMemo(() => buildCharMap(displayText), [displayText]);

  const rgbByChar = useMemo<RGB[] | null>(() => {
    if (!predLab || predLab.length !== displayText.length) return null;
    const smoothed = smoothLetterLabs(predLab, displayText);
    return predLab.map((raw, i) => {
      const s = smoothed[i]!;
      const L = raw[0]! * (1 - LAB_BLEND) + s[0]! * LAB_BLEND;
      const a = raw[1]! * (1 - LAB_BLEND) + s[1]! * LAB_BLEND;
      const b = raw[2]! * (1 - LAB_BLEND) + s[2]! * LAB_BLEND;
      return punchRgbForDisplay(hexToRgb(labToHex(L, a, b)), 1.44);
    });
  }, [predLab, displayText]);

  // Fetch prediction whenever debouncedText changes
  useEffect(() => {
    const text = debouncedText.trim();
    if (!text) return;
    let cancelled = false;
    setStatus("loading");
    predictLetterSequenceText(text)
      .then((res) => {
        if (cancelled) return;
        if (res.pred_lab.length !== text.length) { setStatus("error"); return; }
        setPredLab(res.pred_lab.map((x) => [x[0], x[1], x[2]]));
        setPredProm([...res.pred_prominence]);
        setPredSpread([...res.pred_spread]);
        setStatus("idle");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [debouncedText]);

  // Clear predictions when text changes before debounce fires
  useEffect(() => {
    setPredLab(null); setPredProm(null); setPredSpread(null);
  }, [inputText]);

  const drawFrame = useCallback(() => {
    const main = canvasRef.current?.getContext("2d");
    if (!main || glyphs.length === 0) return;

    let sharp = sharpRef.current;
    let mask = maskRef.current;
    let hover = hoverRef.current;
    let work = workRef.current;
    if (!sharp) sharp = sharpRef.current = ensureCanvas();
    if (!mask) mask = maskRef.current = ensureCanvas();
    if (!hover) hover = hoverRef.current = ensureCanvas();
    if (!work) work = workRef.current = ensureCanvas();

    const physW = Math.floor(size.w * dpr);
    const physH = Math.floor(size.h * dpr);
    const canvas = canvasRef.current!;
    if (canvas.width !== physW || canvas.height !== physH) { canvas.width = physW; canvas.height = physH; }
    for (const c of [sharp, mask, hover, work]) {
      if (c.width !== physW || c.height !== physH) { c.width = physW; c.height = physH; }
    }

    const hctx = hover.getContext("2d")!;
    const sctx = sharp.getContext("2d")!;
    const mctx = mask.getContext("2d")!;
    const wctx = work.getContext("2d")!;

    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, physW, physH);
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.font = font;
    hctx.textBaseline = "alphabetic";

    const cx = ptrRef.current.x;
    const cy = ptrRef.current.y;
    if (hovering) {
      const hitIdx = hitTestGlyphIndex(glyphs, cx, cy, font, fontSizePx, (ch) => {
        const c = canvasRef.current;
        if (!c) return 8;
        const ctx = c.getContext("2d");
        if (!ctx) return 8;
        ctx.font = font;
        return ctx.measureText(ch).width;
      });
      if (hitIdx >= 0) {
        const wr = wordCharRangeAt(displayText, hitIdx);
        if (wr) {
          const [wl, wrIdx] = wr;
          const wordGlyphs = glyphs.filter((g) => g.indexInText >= wl && g.indexInText <= wrIdx);
          let wordW = 0;
          for (const g of wordGlyphs) wordW += hctx.measureText(g.char).width;
          const maxDist = Math.max(56, Math.min(480, wordW * 0.72 + fontSizePx * 2.2));
          for (const g of wordGlyphs) {
            const gw = hctx.measureText(g.char).width;
            const gcx = g.x + gw / 2;
            const gcy = g.y - fontSizePx * 0.25;
            const dist = Math.hypot(cx - gcx, cy - gcy);
            const t = Math.max(0, 1 - dist / maxDist);
            const alpha = t * t * 0.88;
            if (alpha < 0.012) continue;
            const r = Math.max(6, fontSizePx * 0.72);
            const grad = hctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, r);
            grad.addColorStop(0, `rgba(255,255,255,${0.7 * alpha})`);
            grad.addColorStop(0.55, `rgba(255,255,255,${0.26 * alpha})`);
            grad.addColorStop(1, "rgba(255,255,255,0)");
            hctx.fillStyle = grad;
            hctx.beginPath();
            hctx.arc(gcx, gcy, r, 0, Math.PI * 2);
            hctx.fill();
          }
        }
      }
      // Spotlight
      hctx.save();
      hctx.translate(cx, cy);
      const rx = Math.max(10, 140); const ry = Math.max(10, 80);
      hctx.scale(rx, ry);
      const g = hctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "rgba(255,255,255,0.99)");
      g.addColorStop(0.28, "rgba(255,255,255,0.9)");
      g.addColorStop(0.55, "rgba(255,255,255,0.48)");
      g.addColorStop(0.82, "rgba(255,255,255,0.1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      hctx.fillStyle = g;
      hctx.beginPath();
      hctx.arc(0, 0, 1, 0, Math.PI * 2);
      hctx.fill();
      hctx.restore();
    }

    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, size.w, size.h);
    mctx.font = font; mctx.textBaseline = "alphabetic"; mctx.fillStyle = "#fff";
    for (const g of glyphs) mctx.fillText(g.char, g.x, g.y);

    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, size.w, size.h);
    sctx.font = font; sctx.textBaseline = "alphabetic";
    const hasPxS = predProm && predProm.length === displayText.length && predSpread && predSpread.length === displayText.length;
    for (const g of glyphs) {
      const li = charMap[g.indexInText] ?? -1;
      if (li < 0) continue;
      const c = rgbByChar?.[g.indexInText] ?? { r: 160, g: 160, b: 160 };
      const prom = hasPxS ? clamp01(predProm![g.indexInText] ?? 0.5) : 0.5;
      const spr = hasPxS ? clamp01(predSpread![g.indexInText] ?? 0.5) : 0.5;
      const vs = visualStyleFromPxS(mapPForRender(prom), mapSForRender(spr), c, fontSizePx);
      sctx.save();
      sctx.globalAlpha = vs.fillAlpha;
      sctx.shadowColor = vs.shadowColor; sctx.shadowBlur = vs.shadowBlur;
      sctx.shadowOffsetX = 0; sctx.shadowOffsetY = 0;
      sctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      sctx.fillText(g.char, g.x, g.y);
      if (vs.strokeStyle) {
        sctx.shadowBlur = 0; sctx.shadowColor = "transparent";
        sctx.strokeStyle = vs.strokeStyle; sctx.lineWidth = vs.strokeWidth;
        sctx.lineJoin = "round"; sctx.miterLimit = 2;
        sctx.strokeText(g.char, g.x, g.y);
      }
      sctx.restore();
    }
    sctx.globalCompositeOperation = "destination-in";
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(mask, 0, 0);
    sctx.globalCompositeOperation = "source-over";

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, physW, physH);
    mctx.filter = `blur(${SOFTEN_BLUR}px)`;
    mctx.drawImage(sharp, 0, 0);
    mctx.filter = "none";

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, physW, physH);
    wctx.drawImage(mask, 0, 0);
    wctx.globalCompositeOperation = "destination-in";
    wctx.drawImage(hover, 0, 0);
    wctx.globalCompositeOperation = "source-over";

    main.setTransform(1, 0, 0, 1, 0, 0);
    main.fillStyle = CANVAS_BG;
    main.fillRect(0, 0, physW, physH);
    main.setTransform(dpr, 0, 0, dpr, 0, 0);
    main.font = font; main.textBaseline = "alphabetic"; main.fillStyle = BASE_GREY;
    for (const g of glyphs) main.fillText(g.char, g.x, g.y);
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.imageSmoothingEnabled = true; main.imageSmoothingQuality = "high";
    main.drawImage(work, 0, 0);

    const grain = ensureGrain(physW, physH);
    if (grain) {
      main.save();
      main.globalCompositeOperation = "overlay";
      main.globalAlpha = GRAIN_ALPHA;
      main.drawImage(grain, 0, 0);
      main.globalAlpha = 1;
      main.globalCompositeOperation = "source-over";
      main.restore();
    }
  }, [glyphs, charMap, rgbByChar, font, size, dpr, hovering, displayText, fontSizePx, predProm, predSpread, ensureGrain]);

  const drawFrameRef = useRef(drawFrame);
  drawFrameRef.current = drawFrame;

  const startFollow = useCallback(() => {
    const step = () => {
      const t = targetPtrRef.current;
      const s = ptrRef.current;
      s.x += (t.x - s.x) * POINTER_SMOOTH;
      s.y += (t.y - s.y) * POINTER_SMOOTH;
      drawFrameRef.current();
      if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 > 0.06) followRafRef.current = requestAnimationFrame(step);
      else followRafRef.current = null;
    };
    followRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      const w = c ? c.clientWidth : el.clientWidth;
      const h = c ? c.clientHeight : el.clientHeight;
      setSize({ w: Math.max(1, w), h: Math.max(1, h) });
      setDpr(window.devicePixelRatio || 1);
    });
    ro.observe(el);
    if (canvasRef.current) ro.observe(canvasRef.current);
    setSize({ w: Math.max(1, canvasRef.current?.clientWidth || el.clientWidth), h: Math.max(1, canvasRef.current?.clientHeight || el.clientHeight) });
    setDpr(window.devicePixelRatio || 1);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { return () => { if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current); }; }, []);
  useEffect(() => { drawFrame(); }, [drawFrame]);

  // Update hover char readout
  const updateHoverChar = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c || !rgbByChar) { setHoverChar(null); return; }
    const r = c.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const measureCh = (ch: string) => { const ctx = c.getContext("2d"); if (!ctx) return 8; ctx.font = font; return ctx.measureText(ch).width; };
    const idx = hitTestGlyphIndex(glyphs, x, y, font, fontSizePx, measureCh);
    if (idx < 0) { setHoverChar(null); return; }
    const rgb = rgbByChar[idx];
    if (!rgb) { setHoverChar(null); return; }
    const hex = `#${[rgb.r, rgb.g, rgb.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    setHoverChar({ ch: displayText[idx] ?? "", hex });
  }, [glyphs, rgbByChar, font, fontSizePx, displayText]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fb]">
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">← Home</Link>
        <h1 className="text-sm font-semibold text-zinc-800">Synesthetic Preview</h1>
        <div className="flex-1" />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type any word or phrase…"
          className="w-72 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-400 focus:outline-none"
        />
        {status === "loading" && <span className="text-xs text-zinc-400">predicting…</span>}
        {status === "error" && <span className="text-xs text-red-500">no model — start a checkpoint first</span>}
        {hoverChar && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span
              className="inline-block h-3 w-3 rounded-full border border-zinc-300"
              style={{ background: hoverChar.hex }}
            />
            <span className="font-mono">{hoverChar.ch}</span>
            <span className="text-zinc-400">{hoverChar.hex}</span>
          </span>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair touch-none"
          style={{ width: "100%", height: "100%" }}
          onPointerMove={(e) => {
            const c = canvasRef.current;
            if (!c) return;
            const r = c.getBoundingClientRect();
            targetPtrRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
            setHovering(true);
            updateHoverChar(e.clientX, e.clientY);
            if (followRafRef.current === null) startFollow();
          }}
          onPointerLeave={() => {
            setHovering(false);
            setHoverChar(null);
            if (followRafRef.current != null) { cancelAnimationFrame(followRafRef.current); followRafRef.current = null; }
            drawFrame();
          }}
          onPointerEnter={(e) => {
            const c = canvasRef.current;
            if (!c) return;
            const r = c.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            targetPtrRef.current = { x, y }; ptrRef.current = { x, y };
            setHovering(true); drawFrame();
          }}
        />
        {!predLab && status === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-zinc-400">Waiting for model prediction…</p>
          </div>
        )}
      </div>
    </div>
  );
}
