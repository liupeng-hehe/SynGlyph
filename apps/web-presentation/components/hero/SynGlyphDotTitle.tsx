"use client";

import { useEffect, useRef } from "react";

import { getLetterMask, insideMask } from "@/lib/colorStudio/letterMaskCache";
import {
  vividFlowerRgbForLetter,
  mixRgb,
  rgbCss,
  type Rgb,
} from "@/lib/colorStudio/synestheticCardPalette";

const WORD = "SYNGLYPH";
const INK: Rgb = { r: 255, g: 255, b: 255 };
const FLOWER_DELAY_MS = 60;
const FLOWER_LIFE_MS = 1080;
const FLOWER_COOLDOWN_MS = 1400;
const FLOWER_MIN_GAP = 40;
const FLOWER_MAX = 12;
const LETTER_HIT = 52;
const LETTER_GAP = 0.09;

type Dot = {
  x: number;
  y: number;
  r: number;
  letter: string;
  ink: Rgb;
  flower: Rgb;
  heat: number;
  armedAt: number;
  lastFlowerAt: number;
};

type Flower = {
  x: number;
  y: number;
  born: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  petals: number;
  color: Rgb;
  center: Rgb;
};

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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function inkBounds(
  data: Uint8ClampedArray,
  mw: number,
  mh: number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = mw;
  let maxX = 0;
  let minY = mh;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!insideMask(data, mw, mh, x, y)) continue;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!found) return null;
  return { minX, maxX, minY, maxY };
}

function buildDots(width: number, height: number): Dot[] {
  const letters = WORD.split("");
  const masks = letters.map((letter) => {
    const mask = getLetterMask(letter);
    if (!mask) return null;
    const bounds = inkBounds(mask.data, mask.w, mask.h);
    if (!bounds) return null;
    return { letter, ...mask, bounds };
  });
  if (masks.some((item) => !item)) return [];

  const targetH = height * 0.88;
  const units = masks.map((item) => {
    const glyph = item!;
    const inkH = Math.max(1, glyph.bounds.maxY - glyph.bounds.minY);
    const inkW = Math.max(1, glyph.bounds.maxX - glyph.bounds.minX);
    const scale = targetH / inkH;
    return { ...glyph, inkH, inkW, scale, drawW: inkW * scale, drawH: targetH };
  });

  const rawGap = targetH * LETTER_GAP;
  const rawWordW = units.reduce((sum, unit) => sum + unit.drawW, 0) + (units.length - 1) * rawGap;
  const fit = Math.min(1, (width * 0.97) / Math.max(1, rawWordW));
  const boxH = targetH * fit;
  const boxGap = rawGap * fit;
  const startX =
    (width - (units.reduce((sum, unit) => sum + unit.drawW * fit, 0) + (units.length - 1) * boxGap)) /
    2;
  const startY = (height - boxH) / 2;
  const avgW = units.reduce((sum, unit) => sum + unit.drawW * fit, 0) / units.length;
  const cell = Math.max(7.6, Math.min(11, avgW * 0.068));
  const rowStep = cell * 0.866;
  const dots: Dot[] = [];
  let cursorX = startX;

  for (const unit of units) {
    const boxW = unit.drawW * fit;
    const s = unit.scale * fit;
    const ox = cursorX - unit.bounds.minX * s;
    const oy = startY - unit.bounds.minY * s;
    const flower = vividFlowerRgbForLetter(unit.letter);
    const rMax = cell * 0.4;
    const rMin = cell * 0.16;
    let row = 0;
    for (let py = startY + cell * 0.35; py < startY + boxH; py += rowStep) {
      const stagger = row % 2 === 0 ? 0 : cell * 0.5;
      for (let px = cursorX + cell * 0.2 + stagger; px < cursorX + boxW; px += cell) {
        const cov = halftoneCoverage(unit.data, unit.w, unit.h, (px - ox) / s, (py - oy) / s);
        if (cov < 0.07) continue;
        const t = Math.pow(cov, 0.72);
        const r = rMin + t * (rMax - rMin);
        if (r < 0.26) continue;
        dots.push({
          x: px,
          y: py,
          r,
          letter: unit.letter,
          ink: INK,
          flower,
          heat: 0,
          armedAt: 0,
          lastFlowerAt: -FLOWER_COOLDOWN_MS,
        });
      }
      row++;
    }
    cursorX += boxW + boxGap;
  }

  return dots;
}

function nearestDot(dots: Dot[], x: number, y: number): { dot: Dot; dist: number } | null {
  let nearest: Dot | null = null;
  let best = Infinity;
  for (const dot of dots) {
    const d = Math.hypot(dot.x - x, dot.y - y);
    if (d < best) {
      best = d;
      nearest = dot;
    }
  }
  return nearest ? { dot: nearest, dist: best } : null;
}

function drawFlower(ctx: CanvasRenderingContext2D, flower: Flower, now: number) {
  const t = Math.min(1, (now - flower.born) / flower.life);
  const bloom = easeOutBack(Math.min(1, t / 0.32));
  const fade = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
  const alpha = Math.max(0, fade) * 0.92;
  if (alpha <= 0.01) return;

  const scale = flower.size * (0.28 + bloom * 0.72);
  const rot = flower.rot + flower.spin * t;
  ctx.save();
  ctx.translate(flower.x, flower.y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;

  for (let i = 0; i < flower.petals; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / flower.petals);
    ctx.beginPath();
    ctx.ellipse(0, -scale * 0.78, scale * 0.26, scale * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(flower.color);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(flower.center);
  ctx.fill();
  ctx.restore();
}

type Props = {
  className?: string;
};

export function SynGlyphDotTitle({ className = "" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reduced = prefersReducedMotion();
    const pointer = { x: -9999, y: -9999, active: false };
    let dots: Dot[] = [];
    const flowers: Flower[] = [];
    let raf = 0;

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = buildDots(width, height);
    };

    const spawnFlower = (dot: Dot, now: number) => {
      if (flowers.length >= FLOWER_MAX) return;
      const tooClose = flowers.some(
        (flower) => Math.hypot(flower.x - dot.x, flower.y - dot.y) < FLOWER_MIN_GAP,
      );
      if (tooClose) return;
      const color = dot.flower;
      flowers.push({
        x: dot.x,
        y: dot.y,
        born: now,
        life: FLOWER_LIFE_MS * (0.88 + Math.random() * 0.28),
        size: Math.max(4.8, dot.r * 2.55),
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.9,
        petals: 5,
        color,
        center: mixRgb(color, { r: 255, g: 248, b: 220 }, 0.45),
      });
      dot.lastFlowerAt = now;
      dot.armedAt = 0;
    };

    const paintStatic = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        ctx.fillStyle = rgbCss(dot.ink);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const hit = pointer.active ? nearestDot(dots, pointer.x, pointer.y) : null;
      const onLetter = Boolean(hit && hit.dist < LETTER_HIT);

      for (const dot of dots) {
        const near =
          onLetter &&
          hit !== null &&
          Math.hypot(dot.x - pointer.x, dot.y - pointer.y) < LETTER_HIT + 22;
        const target = near ? 1 - Math.min(1, Math.hypot(dot.x - pointer.x, dot.y - pointer.y) / 70) : 0;
        dot.heat += (target - dot.heat) * (near ? 0.42 : 0.12);
        if (dot.heat < 0.002) dot.heat = 0;

        const canBloom = ((dot.x * 31 + dot.y * 17) | 0) % 5 === 0;
        if (near && dot.heat > 0.22 && canBloom) {
          if (dot.armedAt === 0) dot.armedAt = now;
          if (
            now - dot.armedAt >= FLOWER_DELAY_MS &&
            now - dot.lastFlowerAt >= FLOWER_COOLDOWN_MS
          ) {
            spawnFlower(dot, now);
          }
        } else if (!near) {
          dot.armedAt = 0;
        }

        ctx.beginPath();
        ctx.fillStyle = rgbCss(dot.ink);
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = flowers.length - 1; i >= 0; i--) {
        const flower = flowers[i]!;
        if (now - flower.born >= flower.life) {
          flowers.splice(i, 1);
          continue;
        }
        drawFlower(ctx, flower, now);
      }

      raf = requestAnimationFrame(tick);
    };

    const setPointer = (clientX: number, clientY: number, active: boolean) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = clientX - rect.left;
      pointer.y = clientY - rect.top;
      pointer.active = active;
    };

    const onPointerMove = (event: PointerEvent) => {
      setPointer(event.clientX, event.clientY, true);
    };
    const onPointerDown = (event: PointerEvent) => {
      setPointer(event.clientX, event.clientY, true);
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") pointer.active = false;
    };

    const start = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* ignore */
      }
      resize();
      if (dots.length === 0) {
        requestAnimationFrame(() => {
          resize();
          if (reduced) paintStatic();
        });
      } else if (reduced) {
        paintStatic();
      }
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) paintStatic();
    });

    void start();

    if (reduced) {
      ro.observe(wrap);
      return () => ro.disconnect();
    }

    const trackRoot = wrap.closest("section") ?? wrap;
    raf = requestAnimationFrame(tick);
    ro.observe(wrap);
    trackRoot.addEventListener("pointermove", onPointerMove, { passive: true });
    trackRoot.addEventListener("pointerdown", onPointerDown, { passive: true });
    trackRoot.addEventListener("pointerleave", onPointerLeave);
    trackRoot.addEventListener("pointerup", onPointerUp);
    trackRoot.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      trackRoot.removeEventListener("pointermove", onPointerMove);
      trackRoot.removeEventListener("pointerdown", onPointerDown);
      trackRoot.removeEventListener("pointerleave", onPointerLeave);
      trackRoot.removeEventListener("pointerup", onPointerUp);
      trackRoot.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`synglyph-dot-title ${className}`.trim()}
      role="presentation"
    >
      <canvas ref={canvasRef} className="synglyph-dot-title__canvas" aria-hidden />
    </div>
  );
}
