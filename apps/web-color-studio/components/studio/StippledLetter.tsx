"use client";

import { useLayoutEffect, useRef } from "react";

import { stippleSynestheticInkHex } from "@/lib/colorUtils";

type MaskPayload = { w: number; h: number; data: Uint8ClampedArray };

/** True if the mask has enough bright “ink” for stippling (letter actually drawn). */
function maskHasLetterInk(data: Uint8ClampedArray): boolean {
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a > 80 && r + g + b > 380) {
      bright++;
      if (bright > 30) return true;
    }
  }
  return false;
}

function buildLetterMask(letter: string): MaskPayload | null {
  if (typeof document === "undefined") return null;
  const char =
    letter && letter.trim().length > 0 ? letter.trim().slice(0, 1) : "?";
  const w = 256;
  const h = 320;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fs = Math.floor(h * 0.5);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const stacks: string[] = [
    `700 ${fs}px ui-serif, "Times New Roman", Georgia, serif`,
    `bold ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`,
  ];

  for (const font of stacks) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = font;
    ctx.fillText(char, w / 2, h / 2);
    const data = ctx.getImageData(0, 0, w, h).data;
    if (maskHasLetterInk(data)) {
      return { w, h, data };
    }
  }

  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

/** White glyph on opaque black mask — must use luminance; alpha alone matches both ink and background. */
function inside(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const i = (y * w + x) * 4;
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  const a = data[i + 3]!;
  return a > 30 && r + g + b > 280;
}

type Props = {
  letter: string;
  backgroundHex: string;
  /** When set, replaces default {@link stippleSynestheticInkHex} hue-aware ink. */
  inkHex?: string;
  /**
   * Multiplier on fitted “contain” scale; greater than 1 enlarges glyph about canvas center (may clip edges).
   */
  glyphScale?: number;
  /** Positive values shift the stipple downward (CSS px in layout space before DPR). */
  translateYPx?: number;
  className?: string;
  variant?: "hero" | "badge";
};

export function StippledLetter({
  letter,
  backgroundHex,
  inkHex,
  glyphScale = 1,
  translateYPx = 0,
  className = "",
  variant = "hero",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<MaskPayload | null>(null);
  const lastLetter = useRef("");

  useLayoutEffect(() => {
    const step = variant === "badge" ? 4 : 3;
    const rMin = variant === "badge" ? 0.45 : 0.65;
    const rMax = variant === "badge" ? 2.6 : 4;

    const wrap = wrapRef.current;
    if (!wrap) return;

    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (lastLetter.current !== letter) {
        maskRef.current = buildLetterMask(letter);
        lastLetter.current = letter;
      }
      const mask = maskRef.current;
      if (!mask) return;

      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (W < 4 || H < 4) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

      for (let y = step; y < mh - step; y += step) {
        for (let x = step; x < mw - step; x += step) {
          if (!inside(data, mw, mh, x, y)) continue;
          let n = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (inside(data, mw, mh, x + dx, y + dy)) n++;
            }
          }
          const t = n / 25;
          const eased = t * t;
          const rMask = rMin + eased * (rMax - rMin);
          const px = x * s + ox;
          const py = y * s + oy;
          const r = rMask * s;
          if (r < 0.35) continue;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);

    let cancelled = false;

    /** First layout frames often report clientWidth/Height 0; retry after flex/aspect settles. */
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) paint();
      });
    });

    void (typeof document !== "undefined" &&
      document.fonts?.ready?.then(() => {
        if (!cancelled) {
          requestAnimationFrame(() => {
            if (!cancelled) paint();
          });
        }
      }));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      ro.disconnect();
    };
  }, [letter, backgroundHex, inkHex, glyphScale, translateYPx, variant]);

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
