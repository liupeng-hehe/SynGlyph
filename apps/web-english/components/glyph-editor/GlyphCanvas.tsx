"use client";

import type { LineCutV2 } from "@/lib/glyph-editor/glyphSchema";

type Props = {
  width: number;
  height: number;
  showGrid: boolean;
  letterDataUrl: string;
  showLetter: boolean;
  cuts: LineCutV2[];
  draftLine: [[number, number], [number, number]] | null;
  /** ⌘/Ctrl + drag scope preview (norm corners). */
  draftScopeNorm: [[number, number], [number, number]] | null;
  /** Active scope for next cut (norm corners). */
  activeClipNorm: [[number, number], [number, number]] | null;
  /** ⌥+⌘ / Alt+Ctrl drag: 横笔保护框预览与生效区域（竖切不挖穿此矩形内像素）。 */
  draftProtectNorm: [[number, number], [number, number]] | null;
  protectedStripNorm: [[number, number], [number, number]] | null;
  /** Colored piece layer (positioned under cut strokes). */
  pieceLayer: React.ReactNode;
};

function normRectToSvg(
  corners: [[number, number], [number, number]],
  w: number,
  h: number
): { x: number; y: number; width: number; height: number } {
  const x1 = corners[0][0] * Math.max(1, w - 1);
  const y1 = corners[0][1] * Math.max(1, h - 1);
  const x2 = corners[1][0] * Math.max(1, w - 1);
  const y2 = corners[1][1] * Math.max(1, h - 1);
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  return {
    x: minX,
    y: minY,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function ReferenceGrid({ w, h }: { w: number; h: number }) {
  const stroke = "rgba(255,255,255,0.14)";
  return (
    <g className="pointer-events-none" opacity={0.95}>
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={stroke} strokeWidth={1} />
      <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={stroke} strokeWidth={1} />
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={1} />
    </g>
  );
}

export function GlyphCanvas({
  width: w,
  height: h,
  showGrid,
  letterDataUrl,
  showLetter,
  cuts,
  draftLine,
  draftScopeNorm,
  activeClipNorm,
  draftProtectNorm,
  protectedStripNorm,
  pieceLayer,
}: Props) {
  return (
    <div className="relative h-full w-full select-none border border-zinc-600 bg-zinc-950 shadow-lg shadow-black/50">
      {showLetter && letterDataUrl && (
        <img
          src={letterDataUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.48]"
          draggable={false}
          style={{ objectFit: "contain" }}
        />
      )}
      <div className="relative z-[1] h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain">
        {pieceLayer}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {showGrid && <ReferenceGrid w={w} h={h} />}
        {cuts.map((c) => {
          const [a, b] = c.points;
          const x1 = a[0] * Math.max(1, w - 1),
            y1 = a[1] * Math.max(1, h - 1),
            x2 = b[0] * Math.max(1, w - 1),
            y2 = b[1] * Math.max(1, h - 1);
          return (
            <line
              key={c.cut_id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgb(234, 179, 8)"
              strokeWidth={Math.max(1.5, c.thickness * 0.35)}
              strokeLinecap="round"
              opacity={0.95}
            />
          );
        })}
        {draftLine && (
          <line
            x1={draftLine[0][0] * Math.max(1, w - 1)}
            y1={draftLine[0][1] * Math.max(1, h - 1)}
            x2={draftLine[1][0] * Math.max(1, w - 1)}
            y2={draftLine[1][1] * Math.max(1, h - 1)}
            stroke="rgb(56, 189, 248)"
            strokeWidth={3}
            strokeDasharray="6 4"
            strokeLinecap="round"
            opacity={0.9}
          />
        )}
        {activeClipNorm && (() => {
          const r = normRectToSvg(activeClipNorm, w, h);
          return (
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="none"
              stroke="rgb(52, 211, 153)"
              strokeWidth={2}
              strokeDasharray="5 4"
              opacity={0.95}
            />
          );
        })()}
        {draftScopeNorm && (() => {
          const r = normRectToSvg(draftScopeNorm, w, h);
          return (
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="rgba(56, 189, 248, 0.08)"
              stroke="rgb(56, 189, 248)"
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={0.95}
            />
          );
        })()}
        {protectedStripNorm && (() => {
          const r = normRectToSvg(protectedStripNorm, w, h);
          return (
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="rgba(232, 121, 249, 0.06)"
              stroke="rgb(232, 121, 249)"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.95}
            />
          );
        })()}
        {draftProtectNorm && (() => {
          const r = normRectToSvg(draftProtectNorm, w, h);
          return (
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="rgba(232, 121, 249, 0.1)"
              stroke="rgb(232, 121, 249)"
              strokeWidth={2}
              strokeDasharray="3 3"
              opacity={0.95}
            />
          );
        })()}
      </svg>
    </div>
  );
}
