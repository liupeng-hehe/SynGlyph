"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function hexWithHash(hex: string) {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PipetteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3 3" />
      <path d="m9 15-4 4v-3" />
    </svg>
  );
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
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

function hsvToHex(h: number, s: number, v: number): string {
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

export function ColorWheelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const size = 160;
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
    <div className="rounded-2xl border border-white/15 bg-[#1a1a24] p-4 shadow-2xl">
      <div className="flex flex-col items-center gap-4">
        <div
          ref={wheelRef}
          className="relative cursor-crosshair select-none overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 50% 50%, white 0%, transparent 70%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`,
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
          <span className="text-xs text-white/60">Brightness</span>
        </div>
      </div>
    </div>
  );
}

/** 2D square picker: X=spread, Y=prominence */
export function ProminenceSpreadPicker({
  prominence,
  spread,
  onChange,
  size = 100,
}: {
  prominence: number;
  spread: number;
  onChange: (p: number, s: number) => void;
  size?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const px = spread * 100;
  const py = (1 - prominence) * 100;

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = boxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      onChange(1 - y, x);
    },
    [onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      updateFromClient(e.clientX, e.clientY);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, updateFromClient]);

  return (
    <div className="flex max-w-full flex-col items-center gap-1" style={{ width: size }}>
      <span className="text-xs text-white/60">P×S (Y×X)</span>
      <div
        ref={boxRef}
        className="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-white/20 bg-white/5"
        style={{ width: size, height: size }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          updateFromClient(e.clientX, e.clientY);
        }}
      >
        <div
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg ${size < 130 ? "h-2.5 w-2.5" : "h-3 w-3"}`}
          style={{ left: `${px}%`, top: `${py}%` }}
        />
      </div>
    </div>
  );
}

/** One rectangle per segment: color + P×S, always visible */
export function SegmentColumn({
  label,
  hex,
  onColorChange,
  onAddToBg,
  prominence,
  spread,
  onPxSChange,
  colorLocked,
  pxsSize = 160,
}: {
  label: string;
  hex: string;
  onColorChange: (hex: string) => void;
  onAddToBg: () => void;
  prominence: number;
  spread: number;
  onPxSChange: (p: number, s: number) => void;
  /** When true, color swatches are display-only (e.g. wrong_intensity review). */
  colorLocked?: boolean;
  /** Side length of the P×S square (annotate default 160; review forms may use smaller). */
  pxsSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const locked = colorLocked === true;
  const colW = Math.max(pxsSize + 44, 140);
  return (
    <div className="relative flex max-w-full shrink-0 flex-col items-center gap-2" style={{ width: colW }}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/70">{label}:</span>
        <div className={`flex items-center gap-1 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <div
            role="button"
            tabIndex={locked ? -1 : 0}
            onDoubleClick={locked ? undefined : onAddToBg}
            className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-white/30 shadow-lg transition hover:scale-105"
            style={{ backgroundColor: hexWithHash(hex) }}
            title="Double-click to add to background"
          >
            <PlusIcon className="h-4 w-4 text-white/70" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => !locked && setOpen((o) => !o)}
              className="relative flex h-10 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-white/30 transition hover:border-white/50"
              style={{ backgroundColor: hexWithHash(hex) }}
              title="Click to pick color"
              disabled={locked}
            >
              <PipetteIcon className="relative z-10 h-5 w-5 text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
            </button>
            {open && !locked && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
                <div className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2" onClick={(e) => e.stopPropagation()}>
                  <ColorWheelPicker value={hex} onChange={onColorChange} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <ProminenceSpreadPicker prominence={prominence} spread={spread} onChange={onPxSChange} size={pxsSize} />
    </div>
  );
}

/** Axis between segments: 0=right invades left, 1=left invades right. Polarity of diffusion at boundary. */
export function BoundaryAxis({
  leftHex,
  rightHex,
  value,
  onChange,
  width = 48,
}: {
  leftHex: string;
  rightHex: string;
  value: number;
  onChange: (v: number) => void;
  width?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const left = hexWithHash(leftHex);
  const right = hexWithHash(rightHex);
  const updateFromClient = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(t);
    },
    [onChange]
  );
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      updateFromClient(e.clientX);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, updateFromClient]);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-white/50">D</span>
      <div
        ref={barRef}
        className="relative cursor-col-resize select-none overflow-hidden rounded border border-white/20"
        style={{
          width,
          height: 24,
          background: `linear-gradient(to right, ${left}, ${right})`,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          updateFromClient(e.clientX);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onChange(0.5);
        }}
        title="Center=no diffusion; right=left invades right; left=right invades left. Double-click to center."
      >
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-white/80 shadow"
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
