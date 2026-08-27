"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const h = hex.replace(/^#/, "").padStart(6, "0");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  return { h: hh * 360, s: s * 100, v: v * 100 };
}

export function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("");
}

type Props = {
  value: string;
  onChange: (hexNoHash: string) => void;
  /** 与英文 annotate 一致：色轮 + 明度条 */
  size?: number;
  brightnessLabel?: string;
};

/**
 * HSV 色盘 + 明度滑条；value/onChange 为 6 位 hex（无 #），与英文版标注交互一致。
 */
export function ColorWheelPicker({
  value,
  onChange,
  size = 160,
  brightnessLabel = "Brightness",
}: Props) {
  const { h, s, v } = hexToHsv(value);
  const wheelRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"wheel" | "slider" | null>(null);
  const r = (s / 100) * 50;
  const angleRad = ((h - 90) * Math.PI) / 180;
  const sx = 50 + r * Math.cos(angleRad);
  const sy = 50 + r * Math.sin(angleRad);
  const updateWheel = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.min(1, Math.hypot(dx, dy) / (rect.width / 2));
      const atan2Deg = Math.atan2(dy, dx) * (180 / Math.PI);
      const newH = (atan2Deg + 90 + 360) % 360;
      const newS = dist * 100;
      onChange(hsvToHex(newH, newS, v));
    },
    [v, onChange]
  );
  const updateSlider = useCallback(
    (clientX: number) => {
      const el = sliderRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(hsvToHex(h, s, t * 100));
    },
    [h, s, onChange]
  );
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging === "wheel") updateWheel(e.clientX, e.clientY);
      else if (dragging === "slider") updateSlider(e.clientX);
    }
    function onMouseUp() {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, updateWheel, updateSlider]);

  return (
    <div className="rounded-2xl border border-stone-600/40 bg-[#0f0f14] p-4 shadow-lg">
      <div className="flex flex-col items-center gap-4">
        <div
          ref={wheelRef}
          className="relative cursor-crosshair select-none overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            background:
              "radial-gradient(circle at 50% 50%, white 0%, transparent 70%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging("wheel");
            updateWheel(e.clientX, e.clientY);
          }}
        >
          <div
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
            style={{ left: `${sx}%`, top: `${sy}%` }}
          />
        </div>
        <div className="flex w-full flex-col items-center gap-1">
          <div
            ref={sliderRef}
            className="relative h-4 w-full cursor-pointer select-none overflow-hidden rounded-full"
            style={{ background: "linear-gradient(to right, #000, #fff)" }}
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging("slider");
              updateSlider(e.clientX);
            }}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
              style={{ left: `${v}%` }}
            />
          </div>
          <span className="text-xs text-white/60">{brightnessLabel}</span>
        </div>
      </div>
    </div>
  );
}
