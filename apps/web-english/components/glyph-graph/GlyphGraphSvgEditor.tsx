"use client";

import { useCallback, useRef, useState } from "react";
import type { PreprocessResult } from "@/lib/glyph-editor/preprocess";
import {
  defaultBezierHandles,
  type TopologyEdge,
  type TopologyNode,
} from "@/lib/glyph-editor/primitiveGraph";

export interface GlyphGraphSvgEditorProps {
  pre: PreprocessResult;
  topology: { nodes: TopologyNode[]; edges: TopologyEdge[] };
  onTopologyChange: (next: { nodes: TopologyNode[]; edges: TopologyEdge[] }) => void;
  copybookImageDataUrl?: string | null;
  /** Light copybook behind dark UI; false = dark line art on light */
  copybookLight?: boolean;
}

/** 笔画调色板（与默认蓝/橘区分） */
const STROKE_PALETTE = [
  "#2563eb",
  "#d97706",
  "#22c55e",
  "#e11d48",
  "#a855f7",
  "#06b6d4",
  "#eab308",
  "#64748b",
];

function nextNodeId(nodes: TopologyNode[]): string {
  let max = -1;
  for (const n of nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `n${max + 1}`;
}

function edgePathD(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ed: TopologyEdge
): string {
  const h = defaultBezierHandles(ax, ay, bx, by);
  const cp1x = ed.cp1x ?? h.cp1x!;
  const cp1y = ed.cp1y ?? h.cp1y!;
  const cp2x = ed.cp2x ?? h.cp2x!;
  const cp2y = ed.cp2y ?? h.cp2y!;
  return `M ${ax} ${ay} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${bx} ${by}`;
}

export function GlyphGraphSvgEditor({
  pre,
  topology,
  onTopologyChange,
  copybookImageDataUrl,
  copybookLight = true,
}: GlyphGraphSvgEditorProps) {
  const w = pre.width;
  const h = pre.height;
  const [dragId, setDragId] = useState<string | null>(null);
  const [edgeFromId, setEdgeFromId] = useState<string | null>(null);
  const [dragHandle, setDragHandle] = useState<{ edgeIndex: number; which: "cp1" | "cp2" } | null>(
    null
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const dragMovedRef = useRef(false);
  const dragLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const clientToSvg = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const loc = clientToSvg(e);
      if (!loc) return;
      const x = Math.max(0, Math.min(w - 1, loc.x));
      const y = Math.max(0, Math.min(h - 1, loc.y));

      if (dragHandle) {
        const { edgeIndex, which } = dragHandle;
        dragMovedRef.current = true;
        onTopologyChange({
          nodes: topology.nodes,
          edges: topology.edges.map((ed, i) => {
            if (i !== edgeIndex) return ed;
            if (which === "cp1") return { ...ed, cp1x: x, cp1y: y };
            return { ...ed, cp2x: x, cp2y: y };
          }),
        });
        return;
      }

      if (!dragId) return;
      const node = topology.nodes.find((n) => n.id === dragId);
      if (!node) return;
      if (!dragLastPosRef.current) dragLastPosRef.current = { x: node.x, y: node.y };
      const last = dragLastPosRef.current;
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx !== 0 || dy !== 0) dragMovedRef.current = true;
      dragLastPosRef.current = { x, y };

      onTopologyChange({
        nodes: topology.nodes.map((n) => (n.id === dragId ? { ...n, x, y } : n)),
        edges: topology.edges.map((ed) => {
          const a = topology.nodes.find((n) => n.id === ed.from)!;
          const b = topology.nodes.find((n) => n.id === ed.to)!;
          const def = defaultBezierHandles(a.x, a.y, b.x, b.y);
          let next: TopologyEdge = { ...ed };
          if (ed.from === dragId) {
            next.cp1x = (ed.cp1x ?? def.cp1x!) + dx;
            next.cp1y = (ed.cp1y ?? def.cp1y!) + dy;
          }
          if (ed.to === dragId) {
            next.cp2x = (ed.cp2x ?? def.cp2x!) + dx;
            next.cp2y = (ed.cp2y ?? def.cp2y!) + dy;
          }
          return next;
        }),
      });
    },
    [clientToSvg, dragHandle, dragId, h, onTopologyChange, topology.edges, topology.nodes, w]
  );

  const endDrag = useCallback(() => {
    if (dragId && !dragMovedRef.current) {
      setSelectedNodeId(dragId);
    }
    dragMovedRef.current = false;
    dragLastPosRef.current = null;
    setDragId(null);
    setDragHandle(null);
  }, [dragId]);

  const handleSvgPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!e.shiftKey) return;
      const t = e.target as Element;
      if (t.closest?.("[data-graph-node]")) return;
      if (t.closest?.("[data-edge-hit]")) return;
      if (t.closest?.("[data-bezier-handle]")) return;
      e.preventDefault();
      const loc = clientToSvg(e);
      if (!loc) return;
      const x = Math.max(0, Math.min(w - 1, loc.x));
      const y = Math.max(0, Math.min(h - 1, loc.y));
      const id = nextNodeId(topology.nodes);
      onTopologyChange({
        nodes: [...topology.nodes, { id, x, y, role: "junction" }],
        edges: topology.edges,
      });
    },
    [clientToSvg, h, w, onTopologyChange, topology.edges, topology.nodes]
  );

  const handleNodePointerDown = (id: string, e: React.PointerEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (!edgeFromId) {
        setEdgeFromId(id);
        return;
      }
      if (edgeFromId === id) {
        setEdgeFromId(null);
        return;
      }
      const a = edgeFromId;
      const b = id;
      const dup = topology.edges.some(
        (ed) => (ed.from === a && ed.to === b) || (ed.from === b && ed.to === a)
      );
      if (!dup) {
        const na = topology.nodes.find((n) => n.id === a)!;
        const nb = topology.nodes.find((n) => n.id === b)!;
        const handles = defaultBezierHandles(na.x, na.y, nb.x, nb.y);
        onTopologyChange({
          nodes: topology.nodes,
          edges: [...topology.edges, { from: a, to: b, ...handles }],
        });
      }
      setEdgeFromId(null);
      return;
    }
    dragMovedRef.current = false;
    const node = topology.nodes.find((n) => n.id === id);
    if (node) dragLastPosRef.current = { x: node.x, y: node.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragId(id);
  };

  const handleDoubleClickNode = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTopologyChange({
      nodes: topology.nodes.filter((n) => n.id !== id),
      edges: topology.edges.filter((ed) => ed.from !== id && ed.to !== id),
    });
    if (edgeFromId === id) setEdgeFromId(null);
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleEdgeHitPointerDown = (edgeIndex: number, e: React.PointerEvent) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    onTopologyChange({
      nodes: topology.nodes,
      edges: topology.edges.filter((_, j) => j !== edgeIndex),
    });
  };

  const applyStrokeColor = (hex: string) => {
    if (!selectedNodeId) return;
    onTopologyChange({
      nodes: topology.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, strokeColor: hex } : n
      ),
      edges: topology.edges,
    });
  };

  const bgStroke = copybookLight ? "#0f172a" : "#e2e8f0";
  const edgeStroke = copybookLight ? "#22d3ee" : "#67e8f9";
  const edgeHitStroke = "rgba(0,0,0,0)";
  const nodeFill = copybookLight ? "#2563eb" : "#93c5fd";
  const junctionFill = copybookLight ? "#d97706" : "#fbbf24";

  const deg = new Map<string, number>();
  for (const n of topology.nodes) deg.set(n.id, 0);
  for (const ed of topology.edges) {
    deg.set(ed.from, (deg.get(ed.from) || 0) + 1);
    deg.set(ed.to, (deg.get(ed.to) || 0) + 1);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-xs text-white/55">
        <span className="text-sky-200/90">蓝/橘=端点/交汇</span> · 边为<strong className="text-white/75">三次贝塞尔</strong>
        （拖菱形控制柄成弧）· 单击选结点 → 选笔画色 · 拖动结点 · 双击删结点 · ⌘/Ctrl 连边 · Shift+空白
        加结点 · Alt+点击边删边
        {edgeFromId ? (
          <span className="ml-2 text-amber-300/90">已选起点 {edgeFromId}，再点另一端</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#0f0f14] px-2 py-2">
        <span className="text-[10px] text-white/45">笔画色（先点选结点）</span>
        {STROKE_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            disabled={!selectedNodeId}
            className="h-6 w-6 rounded border border-white/20 shadow-sm disabled:opacity-30"
            style={{ backgroundColor: c }}
            onClick={() => applyStrokeColor(c)}
          />
        ))}
        <button
          type="button"
          disabled={!selectedNodeId}
          className="rounded border border-white/25 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10 disabled:opacity-30"
          onClick={() => {
            if (!selectedNodeId) return;
            onTopologyChange({
              nodes: topology.nodes.map((n) =>
                n.id === selectedNodeId ? { ...n, strokeColor: undefined } : n
              ),
              edges: topology.edges,
            });
          }}
        >
          恢复默认色
        </button>
        {selectedNodeId ? (
          <span className="text-[10px] text-emerald-300/90">已选 {selectedNodeId}</span>
        ) : null}
      </div>
      <div className="w-full rounded-xl border border-white/15 bg-[#12121a] p-3">
        <div
          className="relative w-full overflow-hidden rounded-lg"
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full bg-[#0b0b10]"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget && !e.shiftKey) setSelectedNodeId(null);
              handleSvgPointerDown(e);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            {copybookImageDataUrl ? (
              <image
                href={copybookImageDataUrl}
                x={0}
                y={0}
                width={w}
                height={h}
                preserveAspectRatio="none"
                opacity={copybookLight ? 0.92 : 0.85}
                style={{ pointerEvents: "none" }}
              />
            ) : null}
            {topology.edges.map((ed, i) => {
              const a = topology.nodes.find((n) => n.id === ed.from);
              const b = topology.nodes.find((n) => n.id === ed.to);
              if (!a || !b) return null;
              const d = edgePathD(a.x, a.y, b.x, b.y, ed);
              return (
                <g key={`edge-stroke-${ed.from}-${ed.to}-${i}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={edgeStroke}
                    strokeWidth={3}
                    strokeLinecap="round"
                    style={{ pointerEvents: "none" }}
                  />
                  <path
                    data-edge-hit
                    d={d}
                    fill="none"
                    stroke={edgeHitStroke}
                    strokeWidth={16}
                    strokeLinecap="round"
                    className="cursor-pointer"
                    style={{ pointerEvents: "stroke" }}
                    onPointerDown={(e) => handleEdgeHitPointerDown(i, e)}
                  />
                </g>
              );
            })}
            {topology.nodes.map((n) => {
              const d = deg.get(n.id) || 0;
              const isJunction =
                n.role === "junction" ? true : n.role === "endpoint" ? false : d >= 3;
              const r = isJunction ? 2.5 : 2;
              const defaultFill = isJunction ? junctionFill : nodeFill;
              const fill = n.strokeColor ?? defaultFill;
              const selected = selectedNodeId === n.id;
              return (
                <g key={n.id} data-graph-node>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 11}
                    fill="transparent"
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => handleNodePointerDown(n.id, e)}
                    onDoubleClick={(e) => handleDoubleClickNode(n.id, e)}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={fill}
                    stroke={selected ? "#f8fafc" : bgStroke}
                    strokeWidth={selected ? 1.5 : 1}
                    style={{ pointerEvents: "none" }}
                  />
                  <text
                    x={n.x + 5}
                    y={n.y - 2}
                    fill={copybookLight ? "#0f172a" : "#e2e8f0"}
                    fontSize={8}
                    fontFamily="ui-monospace, monospace"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.id}
                  </text>
                </g>
              );
            })}
            {topology.edges.map((ed, i) => {
              const a = topology.nodes.find((n) => n.id === ed.from);
              const b = topology.nodes.find((n) => n.id === ed.to);
              if (!a || !b) return null;
              const h0 = defaultBezierHandles(a.x, a.y, b.x, b.y);
              const cp1x = ed.cp1x ?? h0.cp1x!;
              const cp1y = ed.cp1y ?? h0.cp1y!;
              const cp2x = ed.cp2x ?? h0.cp2x!;
              const cp2y = ed.cp2y ?? h0.cp2y!;
              return (
                <g key={`edge-handles-${ed.from}-${ed.to}-${i}`}>
                  <circle
                    data-bezier-handle
                    cx={cp1x}
                    cy={cp1y}
                    r={2.5}
                    fill={copybookLight ? "#f472b6" : "#fbcfe8"}
                    stroke="#1e293b"
                    strokeWidth={1}
                    className="cursor-move"
                    style={{ pointerEvents: "all" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dragMovedRef.current = false;
                      setDragHandle({ edgeIndex: i, which: "cp1" });
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                    }}
                  />
                  <circle
                    data-bezier-handle
                    cx={cp2x}
                    cy={cp2y}
                    r={2.5}
                    fill={copybookLight ? "#c084fc" : "#e9d5ff"}
                    stroke="#1e293b"
                    strokeWidth={1}
                    className="cursor-move"
                    style={{ pointerEvents: "all" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dragMovedRef.current = false;
                      setDragHandle({ edgeIndex: i, which: "cp2" });
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
