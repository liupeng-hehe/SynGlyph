"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { labToHex } from "@synglyph/shared";

const L_MIN = 12;
const L_MAX = 96;

/** 仅 SVG 尺寸参与居中，圆心 (cx,cy) 与画布锚点像素重合；提示文案绝对定位不占流式高度 */
const W = 200;
const H = 200;
const cx = W / 2;
const cy = H / 2;
const R = 70;

const ARC_STROKE = 20;
const ARC_OUTLINE = 24;
const HIT_STROKE = 56;
const CENTER_R = 10;
const KNOB_R = 13;

type Props = {
  open: boolean;
  anchorLeft: number;
  anchorTop: number;
  lab: [number, number, number];
  onLabChange: (lab: [number, number, number]) => void;
  onCommit?: (lab: [number, number, number]) => void;
  onClose: () => void;
};

/**
 * 半圆明暗：弧的渐变为当前选区色相（固定 a、b）下 L 从明→暗；圆心与画布部件锚点重合。
 */
export function BrightnessArcPicker({
  open,
  anchorLeft,
  anchorTop,
  lab,
  onLabChange,
  onCommit,
  onClose,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const dragging = useRef(false);
  const latestLabRef = useRef<[number, number, number]>(lab);
  latestLabRef.current = lab;

  const [L, a, b] = lab;
  const t = Math.max(0, Math.min(1, (L_MAX - L) / (L_MAX - L_MIN)));
  const theta = t * Math.PI;

  const knobX = cx + R * Math.sin(theta);
  const knobY = cy - R * Math.cos(theta);

  const brightHex = labToHex(L_MAX, a, b);
  const darkHex = labToHex(L_MIN, a, b);
  const strokeHex = labToHex(L, a, b);

  const setLFromClient = useCallback(
    (clientX: number, clientY: number, el: SVGSVGElement) => {
      const r = el.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const dx = x - cx;
      const dy = y - cy;
      let ang = Math.atan2(dx, -(y - cy));
      if (!Number.isFinite(ang)) ang = 0;
      if (ang < 0) ang = 0;
      if (ang > Math.PI) ang = Math.PI;
      const nL = L_MAX - (ang / Math.PI) * (L_MAX - L_MIN);
      const next: [number, number, number] = [Math.max(L_MIN, Math.min(L_MAX, nL)), a, b];
      latestLabRef.current = next;
      onLabChange(next);
    },
    [a, b, onLabChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCommit?.(latestLabRef.current);
        onClose();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "[") {
        e.preventDefault();
        const next: [number, number, number] = [Math.min(L_MAX, L + 3), a, b];
        onLabChange(next);
        onCommit?.(next);
      }
      if (e.key === "ArrowDown" || e.key === "]") {
        e.preventDefault();
        const next: [number, number, number] = [Math.max(L_MIN, L - 3), a, b];
        onLabChange(next);
        onCommit?.(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, L, a, b, onLabChange, onCommit, onClose]);

  useEffect(() => {
    if (!open) return;
    let remove: (() => void) | undefined;
    const t = window.setTimeout(() => {
      const onDoc = (e: MouseEvent) => {
        const el = e.target as Node | null;
        if (el && (el as HTMLElement).closest?.("[data-brightness-arc-root]")) return;
        onCommit?.(latestLabRef.current);
        onClose();
      };
      document.addEventListener("mousedown", onDoc);
      remove = () => document.removeEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(t);
      remove?.();
    };
  }, [open, onCommit, onClose]);

  const endDrag = useCallback(
    (svg: SVGSVGElement, pointerId: number) => {
      dragging.current = false;
      try {
        if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      onCommit?.(latestLabRef.current);
    },
    [onCommit]
  );

  if (!open) return null;

  return (
    <div
      data-brightness-arc-root
      className="pointer-events-auto fixed z-[80]"
      style={{
        left: anchorLeft,
        top: anchorTop,
        transform: "translate(-50%, -50%)",
      }}
      role="dialog"
      aria-label="明暗选择"
    >
      {/* 固定为 W×H，保证 translate 中心 = SVG 圆心 = 画布锚点 */}
      <div className="relative" style={{ width: W, height: H }}>
        <p className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap text-sm text-white/60 drop-shadow-md">
          沿半圆拖动 · Esc 关闭
        </p>
        <svg
          width={W}
          height={H}
          className="block touch-none select-none drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          onPointerDown={(e) => {
            e.stopPropagation();
            dragging.current = true;
            const svg = e.currentTarget;
            svg.setPointerCapture(e.pointerId);
            setLFromClient(e.clientX, e.clientY, svg);

            const move = (ev: PointerEvent) => {
              if (!dragging.current) return;
              setLFromClient(ev.clientX, ev.clientY, svg);
            };
            const up = (ev: PointerEvent) => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              endDrag(svg, ev.pointerId);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          <defs>
            <linearGradient id={`${uid}-arc`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={`#${brightHex}`} />
              <stop offset="100%" stopColor={`#${darkHex}`} />
            </linearGradient>
          </defs>
          <text
            x={cx}
            y={cy - R - 10}
            textAnchor="middle"
            className="pointer-events-none fill-white font-serif drop-shadow-md"
            style={{ fontSize: 20 }}
          >
            明
          </text>
          <path
            d={`M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx} ${cy + R}`}
            fill="none"
            stroke={`url(#${uid}-arc)`}
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
            className="pointer-events-none"
          />
          <path
            d={`M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx} ${cy + R}`}
            fill="none"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={ARC_OUTLINE}
            strokeLinecap="round"
            className="pointer-events-none"
          />
          {/* 枢轴：与画布锚点同一坐标；外圈白边便于与笔画上的点重合辨认 */}
          <circle
            cx={cx}
            cy={cy}
            r={CENTER_R}
            fill={`#${strokeHex}`}
            stroke="#f8fafc"
            strokeWidth={2}
            className="pointer-events-none"
          />
          <circle
            cx={knobX}
            cy={knobY}
            r={KNOB_R}
            fill={`#${strokeHex}`}
            stroke="#171717"
            strokeWidth={2}
            className="pointer-events-none"
          />
          <text
            x={cx}
            y={cy + R + 28}
            textAnchor="middle"
            className="pointer-events-none fill-white font-serif drop-shadow-md"
            style={{ fontSize: 20 }}
          >
            暗
          </text>
          <path
            d={`M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx} ${cy + R}`}
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_STROKE}
            strokeLinecap="round"
            className="cursor-grab active:cursor-grabbing"
          />
        </svg>
      </div>
    </div>
  );
}
