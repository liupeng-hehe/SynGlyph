"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INK = "#002FA7";
const MUTED = "rgba(0, 47, 167, 0.55)";

/** Full-canvas picker: inset maps pointer × model space so the knob stays inside the rounded tile. */
const FILL_KNOB_EDGE_INSET = 0.08;

/** P×S square: Y=prominence, X=spread — cream/light theme (annotate semantics, not dark chrome). */
export function LabProminenceSpreadPicker({
  prominence,
  spread,
  onChange,
  size = 108,
  fill = false,
  disabled,
  showAxisLabel = true,
  showCaption = true,
}: {
  prominence: number;
  spread: number;
  onChange: (p: number, s: number) => void;
  size?: number;
  /** When true, the draggable layer fills the parent (same box as a letter canvas overlay). */
  fill?: boolean;
  disabled?: boolean;
  /** When false, hides the “P×S (Y×X)” line (use a single legend above a grid). */
  showAxisLabel?: boolean;
  /** When false, hides the P/S prose under the square (word grid). */
  showCaption?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = boxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xr = (clientX - rect.left) / rect.width;
      const yr = (clientY - rect.top) / rect.height;
      let x: number;
      let y: number;
      if (fill) {
        const m = FILL_KNOB_EDGE_INSET;
        const d = Math.max(1e-6, 1 - 2 * m);
        x = Math.max(0, Math.min(1, (xr - m) / d));
        y = Math.max(0, Math.min(1, (yr - m) / d));
      } else {
        x = Math.max(0, Math.min(1, xr));
        y = Math.max(0, Math.min(1, yr));
      }
      onChange(1 - y, x);
    },
    [fill, onChange],
  );

  const mPct = fill ? FILL_KNOB_EDGE_INSET * 100 : 0;
  const spanPct = 100 - 2 * mPct;
  const leftPct = mPct + spread * spanPct;
  const topPct = mPct + (1 - prominence) * spanPct;

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      updateFromClient(e.clientX, e.clientY);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, updateFromClient]);

  const knobPx = fill ? undefined : size < 120 ? 10 : 12;

  return (
    <div
      className={`flex max-w-full flex-col ${fill ? "h-full w-full min-h-0" : "items-start gap-1"}`}
      style={fill ? undefined : { width: size }}
    >
      {showAxisLabel ? (
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
          P×S (Y×X)
        </span>
      ) : null}
      <div
        ref={boxRef}
        className={`relative select-none overflow-hidden ${
          fill
            ? `h-full min-h-0 w-full min-w-0 rounded-3xl border-0 bg-transparent ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair"
              }`
            : `rounded-lg border bg-white/55 shadow-inner ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair"
              }`
        }`}
        style={{
          ...(fill
            ? {}
            : {
                width: size,
                height: size,
                borderColor: `${INK}33`,
                backgroundImage: `linear-gradient(180deg, rgba(0,47,167,0.07) 0%, transparent 45%), linear-gradient(90deg, transparent 0%, rgba(0,47,167,0.05) 100%)`,
              }),
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setDragging(true);
          updateFromClient(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
        }}
        onPointerCancel={(e) => {
          setDragging(false);
          try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        onLostPointerCapture={() => setDragging(false)}
      >
        <div
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm ${
            fill ? "min-h-[7px] min-w-[7px] max-h-[12px] max-w-[12px] h-[13%] w-[13%]" : ""
          }`}
          style={{
            left: `${leftPct}%`,
            top: `${topPct}%`,
            ...(fill
              ? {
                  borderColor: INK,
                  background: "rgba(255,252,247,0.92)",
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.85)`,
                }
              : {
                  width: knobPx,
                  height: knobPx,
                  borderColor: INK,
                  background: "rgba(255,252,247,0.95)",
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.9)`,
                }),
          }}
        />
      </div>
      {showCaption ? (
        <p className="max-w-[14rem] text-[10px] leading-snug opacity-70" style={{ color: INK }}>
          P — prominence (glow strength). S — spread (softer / more diffuse halo).
        </p>
      ) : null}
    </div>
  );
}

/** D: boundary diffusion polarity — gradient between left and right letter colors. */
export function LabBoundaryBar({
  leftHex,
  rightHex,
  value,
  onChange,
  width = 72,
  disabled,
  showLabels = true,
}: {
  leftHex: string;
  rightHex: string;
  value: number;
  onChange: (v: number) => void;
  width?: number;
  disabled?: boolean;
  /** When false, only the gradient bar (legend explains D once above the row). */
  showLabels?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const L = leftHex.startsWith("#") ? leftHex : `#${leftHex}`;
  const R = rightHex.startsWith("#") ? rightHex : `#${rightHex}`;

  const updateFromClient = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(t);
    },
    [onChange],
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

  const title =
    "D — boundary blend between neighbors. Center = neutral. Double-click to reset to center.";

  return (
    <div className={`flex flex-col items-center ${showLabels ? "gap-0.5" : "gap-0"}`}>
      {showLabels ? (
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
          D
        </span>
      ) : null}
      <div
        ref={barRef}
        className={`relative select-none overflow-hidden rounded-md border ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-col-resize"
        }`}
        style={{
          width,
          height: showLabels ? 22 : width >= 44 ? 24 : 20,
          borderColor: `${INK}28`,
          background: `linear-gradient(to right, ${L}, ${R})`,
        }}
        onMouseDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
          updateFromClient(e.clientX);
        }}
        onDoubleClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          onChange(0.5);
        }}
        title={title}
        aria-label={title}
      >
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,47,167,0.25)]"
          style={{ left: `${value * 100}%` }}
        />
      </div>
      {showLabels ? (
        <span className="text-[9px] opacity-60" style={{ color: INK }}>
          迁移 / boundary
        </span>
      ) : null}
    </div>
  );
}
