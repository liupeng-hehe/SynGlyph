"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import { stippleSynestheticInkHex } from "@/lib/colorStudio/colorUtils";
import { LETTER_GRID_EXPORT_PREP_EVENT } from "@/lib/colorStudio/letterGridExportPrep";
import { getLetterMask, insideMask } from "@/lib/colorStudio/letterMaskCache";

type Props = {
  letter: string;
  backgroundHex: string;
  inkHex?: string;
  glyphScale?: number;
  translateYPx?: number;
  className?: string;
  variant?: "hero" | "badge";
  density?: "full" | "compact";
  /** When true, paint immediately instead of waiting for scroll into view. */
  eager?: boolean;
};

/** Soft 0–1 fill for halftone dot sizing (1 = letter core, 0 = outside). */
function halftoneCoverage(
  data: Uint8ClampedArray,
  mw: number,
  mh: number,
  x: number,
  y: number,
): number {
  let sum = 0;
  let wsum = 0;
  const radius = 5;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const w = 1 - d / radius;
      wsum += w;
      if (insideMask(data, mw, mh, Math.round(x + dx), Math.round(y + dy))) {
        sum += w;
      }
    }
  }
  return wsum > 0 ? sum / wsum : 0;
}

function StippledLetterInner({
  letter,
  backgroundHex,
  inkHex,
  glyphScale = 1,
  translateYPx = 0,
  className = "",
  variant = "hero",
  density = "full",
  eager = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }

    const el = wrapRef.current;
    if (!el) return;

    const forcePaint = () => setVisible(true);
    document.addEventListener(LETTER_GRID_EXPORT_PREP_EVENT, forcePaint);
    if (el.closest("[data-letter-grid-export]")) setVisible(true);

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return () =>
        document.removeEventListener(LETTER_GRID_EXPORT_PREP_EVENT, forcePaint);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "120px", threshold: 0.01 },
    );
    io.observe(el);
    return () => {
      document.removeEventListener(LETTER_GRID_EXPORT_PREP_EVENT, forcePaint);
      io.disconnect();
    };
  }, [eager]);

  useLayoutEffect(() => {
    if (!visible) return;

    const wrap = wrapRef.current;
    if (!wrap) return;

    const cell =
      density === "compact"
        ? variant === "badge"
          ? 7.5
          : 6.5
        : variant === "badge"
          ? 6
          : 5.5;
    const rowStep = cell * 0.866; // hex-ish stagger

    let raf = 0;

    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const mask = getLetterMask(letter);
      if (!mask) return;

      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (W < 4 || H < 4) return;

      const dpr = Math.min(window.devicePixelRatio || 1, density === "compact" ? 1.75 : 2);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const ink = inkHex ?? stippleSynestheticInkHex(backgroundHex);
      ctx.fillStyle = ink;

      const { w: mw, h: mh, data } = mask;
      const sFit = Math.min(W / mw, H / mh);
      const s = sFit * Math.max(0.25, glyphScale);
      const ox = (W - s * mw) / 2;
      const oy = (H - s * mh) / 2 + translateYPx;

      const rMax = cell * 0.46;
      const rMin = cell * 0.06;

      let row = 0;
      for (let py = cell * 0.55; py < H + cell; py += rowStep) {
        const stagger = row % 2 === 0 ? 0 : cell * 0.5;
        for (let px = cell * 0.55 + stagger; px < W + cell; px += cell) {
          const mx = (px - ox) / s;
          const my = (py - oy) / s;
          const cov = halftoneCoverage(data, mw, mh, mx, my);
          if (cov < 0.07) continue;
          const t = Math.pow(cov, 0.72);
          const r = rMin + t * (rMax - rMin);
          if (r < 0.25) continue;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
        row++;
      }
    };

    const schedulePaint = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };

    schedulePaint();
    const ro = new ResizeObserver(schedulePaint);
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [letter, backgroundHex, inkHex, glyphScale, translateYPx, variant, density, visible]);

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
    </div>
  );
}

export const StippledLetter = memo(StippledLetterInner);
