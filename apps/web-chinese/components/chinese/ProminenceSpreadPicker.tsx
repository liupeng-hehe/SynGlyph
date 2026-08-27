"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 与英文 annotate 一致：2D 方框，X=spread（虚实/扩散），Y=prominence（突出） */
export function ProminenceSpreadPicker({
  prominence,
  spread,
  onChange,
  size = 160,
  caption,
}: {
  prominence: number;
  spread: number;
  onChange: (prominence: number, spread: number) => void;
  size?: number;
  /** 默认与英文 annotate 的 P×S 说明一致：纵轴突出、横轴虚实（扩散） */
  caption?: string;
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
    <div className="flex w-full max-w-[200px] flex-col items-center gap-1">
      <span className="text-center text-xs text-white/60">
        {caption ?? "P×S（纵：突出 · 横：虚实）"}
      </span>
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
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
          style={{ left: `${px}%`, top: `${py}%` }}
        />
      </div>
    </div>
  );
}
