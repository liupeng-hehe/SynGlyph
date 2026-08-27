"use client";

import {
  useMemo,
  useRef,
  useCallback,
  useId,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { InteractionMode, PreviewMode } from "@/lib/chineseStore";
import { labColorFromJson } from "@/lib/labColor";
import {
  squareCenteredViewBoxFromMedians,
  CHINESE_GLYPH_VIEW_PAD,
  CHINESE_TIANZIGE_DISPLAY_MAX_W_PX,
  CHINESE_TIANZIGE_DISPLAY_MAX_H_PX,
  CHINESE_TIANZIGE_DISPLAY_MAX_VH,
  CHINESE_GLYPH_VISUAL_SCALE,
  gradientLineEndpointsForTransition,
  regionAnchorNorm,
  buildTransitionGradientSpec,
} from "@/lib/chineseGlyphLayout";

/** Hanzi Writer 坐标系：原点在左下，y 向上；SVG 需 y 向下，故 translate(0,H) scale(1,-1) */
export const HANZI_WRITER_VIEW_HEIGHT = 900;

export type RegionView = {
  id: string;
  name: string;
  stroke_ids_json: number[] | null;
  polygon_json: { x: number; y: number }[] | null;
  anchor_json: { x: number; y: number };
  color_json: { space?: string; value?: number[] };
  spread_json: { sx?: number; sy?: number };
  intensity: number;
};

export type TransitionView = {
  id: string;
  source_region_id: string;
  target_region_id: string;
  strength: number;
  width: number;
  falloff: number;
  /** 多段过渡：沿轴排序的区域 id 列表（含源、目标及双击加入的中间区域） */
  curve_json?: { ordered_region_ids?: string[] } | null;
};

export type GlyphCanvasHandle = {
  clientToNorm: (clientX: number, clientY: number) => { nx: number; ny: number };
  /** 区域锚点（与画布小圆点一致）在视口中的像素位置 */
  getAnchorClientPosition: (regionId: string) => { x: number; y: number } | null;
};

type Props = {
  medians: number[][][];
  strokes: string[];
  strokeFills?: string[];
  variant?: "paper" | "mizi";
  viewRegions: RegionView[];
  transitions: TransitionView[];
  interactionMode: InteractionMode;
  previewMode: PreviewMode;
  selectedStrokeIds: number[];
  selectedRegionId: string | null;
  showAnchors?: boolean;
  onStrokeClick: (strokeIndex: number) => void;
  transitionPreview?: { sourceRegionId: string; endNx: number; endNy: number } | null;
  hoverTargetRegionId?: string | null;
  /** 选笔画阶段：用色轮颜色预览选中笔画填充 */
  draftPreviewHex?: string | null;
  /** 框选结束：replace 替换选择，add 与 Shift 合并 */
  onMarqueeSelect?: (strokeIds: number[], mode: "replace" | "add") => void;
  /** 过渡模式：Shift+拖动锚点松手后提交归一化坐标 */
  onRegionAnchorCommit?: (regionId: string, norm: { x: number; y: number }) => void;
  /** 过渡模式：点击锚点（不按 Shift）选中区域 */
  onRegionSelect?: (regionId: string) => void;
  /** 选笔画模式：点击部件锚点打开明暗调节（半圆控件） */
  onBrightnessAnchorClick?: (regionId: string, clientX: number, clientY: number) => void;
  /** 过渡模式：双击笔画将所属区域加入当前过渡色标链 */
  onTransitionStrokeDoubleClick?: (strokeIndex: number) => void;
};

const DRAG_PX = 6;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function orderedRegionIdsForTransition(t: TransitionView): string[] {
  const ids = t.curve_json?.ordered_region_ids;
  if (
    ids &&
    ids.length >= 2 &&
    ids.includes(t.source_region_id) &&
    ids.includes(t.target_region_id)
  ) {
    return ids;
  }
  return [t.source_region_id, t.target_region_id];
}

function strokeInRegion(strokeIdx: number, reg: RegionView | undefined): boolean {
  if (!reg) return false;
  const ids = reg.stroke_ids_json ?? [];
  return ids.includes(strokeIdx);
}

function bboxFromMedianStroke(pts: number[][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.length < 2) continue;
    const x = p[0]!;
    const y = p[1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function rectsIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function MiziGrid({
  box,
  strokeW,
}: {
  box: { x: number; y: number; w: number; h: number };
  strokeW: number;
}) {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g className="pointer-events-none" aria-hidden>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="#171717"
        strokeWidth={Math.max(2, w * 0.006)}
      />
      <line x1={cx} y1={y} x2={cx} y2={y + h} stroke="#6b7280" strokeWidth={strokeW} />
      <line x1={x} y1={cy} x2={x + w} y2={cy} stroke="#6b7280" strokeWidth={strokeW} />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="#9ca3af" strokeWidth={strokeW * 0.85} />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="#9ca3af" strokeWidth={strokeW * 0.85} />
    </g>
  );
}

export const GlyphCanvas = forwardRef<GlyphCanvasHandle, Props>(function GlyphCanvas(
  {
    medians,
    strokes,
    strokeFills,
    variant = "mizi",
    viewRegions,
    transitions,
    interactionMode,
    previewMode,
    selectedStrokeIds,
    selectedRegionId,
    showAnchors = false,
    onStrokeClick,
    transitionPreview = null,
    hoverTargetRegionId = null,
    draftPreviewHex = null,
    onMarqueeSelect,
    onRegionAnchorCommit,
    onRegionSelect,
    onBrightnessAnchorClick,
    onTransitionStrokeDoubleClick,
  },
  ref
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const flipGroupRef = useRef<SVGGElement | null>(null);
  const dotPatternId = `paper-dot-${useId().replace(/:/g, "")}`;
  const uid = useId().replace(/:/g, "");
  const box = useMemo(
    () => squareCenteredViewBoxFromMedians(medians, CHINESE_GLYPH_VIEW_PAD),
    [medians]
  );
  const hanziVisualScaleTransform = useMemo(() => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const s = CHINESE_GLYPH_VISUAL_SCALE;
    return `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
  }, [box]);
  const paperStyle = variant === "paper";
  const gridStroke = Math.max(0.8, box.w * 0.0012);

  const [marqueeHanzi, setMarqueeHanzi] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  const [anchorDrag, setAnchorDrag] = useState<{
    regionId: string;
    nx: number;
    ny: number;
  } | null>(null);

  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startHanziX: number;
    startHanziY: number;
    strokeIdx?: number;
    marquee: boolean;
    marqueeRect: { minX: number; minY: number; maxX: number; maxY: number } | null;
  } | null>(null);

  const fills = useMemo(() => {
    return strokes.map((_, i) => strokeFills?.[i] ?? (paperStyle ? "#3f3f46" : "#2d2d2d"));
  }, [strokes, strokeFills, paperStyle]);

  const regionById = useMemo(() => {
    const m = new Map<string, RegionView>();
    viewRegions.forEach((r) => m.set(r.id, r));
    return m;
  }, [viewRegions]);

  const anchorNorm = useCallback(
    (reg: RegionView) => {
      if (anchorDrag?.regionId === reg.id) {
        return { x: anchorDrag.nx, y: anchorDrag.ny };
      }
      return regionAnchorNorm(reg, medians, box);
    },
    [medians, box, anchorDrag]
  );

  const transitionIdForStroke = useMemo(() => {
    const out: (string | null)[] = strokes.map(() => null);
    for (const t of transitions) {
      const ordered = orderedRegionIdsForTransition(t);
      for (let i = 0; i < strokes.length; i++) {
        if (out[i]) continue;
        for (const rid of ordered) {
          const reg = regionById.get(rid);
          if (reg && strokeInRegion(i, reg)) {
            out[i] = t.id;
            break;
          }
        }
      }
    }
    return out;
  }, [transitions, regionById, strokes.length]);

  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      const g = flipGroupRef.current;
      if (!svg || !g) return { nx: 0.5, ny: 0.5 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = g.getScreenCTM();
      if (!ctm) return { nx: 0.5, ny: 0.5 };
      const loc = pt.matrixTransform(ctm.inverse());
      return {
        nx: (loc.x - box.x) / box.w,
        ny: (loc.y - box.y) / box.h,
      };
    },
    [box]
  );

  const clientToHanzi = useCallback(
    (clientX: number, clientY: number) => {
      const { nx, ny } = clientToNorm(clientX, clientY);
      return { x: box.x + nx * box.w, y: box.y + ny * box.h };
    },
    [clientToNorm, box]
  );

  const getAnchorClientPosition = useCallback(
    (regionId: string): { x: number; y: number } | null => {
      const reg = regionById.get(regionId);
      if (!reg) return null;
      const an = anchorNorm(reg);
      const ax = box.x + an.x * box.w;
      const ay = box.y + an.y * box.h;
      const g = flipGroupRef.current;
      const svg = svgRef.current;
      if (!g || !svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = ax;
      pt.y = ay;
      const ctm = g.getScreenCTM();
      if (!ctm) return null;
      const scr = pt.matrixTransform(ctm);
      return { x: scr.x, y: scr.y };
    },
    [regionById, anchorNorm, box]
  );

  useImperativeHandle(
    ref,
    () => ({
      clientToNorm: (clientX: number, clientY: number) => clientToNorm(clientX, clientY),
      getAnchorClientPosition,
    }),
    [clientToNorm, getAnchorClientPosition]
  );

  const handleAnchorPointerDown = useCallback(
    (e: React.PointerEvent, regId: string) => {
      if (!showAnchors) return;
      if (interactionMode === "select_strokes" && onBrightnessAnchorClick) {
        e.stopPropagation();
        e.preventDefault();
        onRegionSelect?.(regId);
        const pos = getAnchorClientPosition(regId);
        onBrightnessAnchorClick(regId, pos?.x ?? e.clientX, pos?.y ?? e.clientY);
        return;
      }
      if (interactionMode !== "create_transition") return;
      if (e.shiftKey) {
        e.stopPropagation();
        e.preventDefault();
        const start = clientToNorm(e.clientX, e.clientY);
        const latest = {
          regionId: regId,
          nx: clamp01(start.nx),
          ny: clamp01(start.ny),
        };
        setAnchorDrag(latest);
        const move = (ev: PointerEvent) => {
          const n = clientToNorm(ev.clientX, ev.clientY);
          latest.nx = clamp01(n.nx);
          latest.ny = clamp01(n.ny);
          setAnchorDrag({ ...latest });
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          setAnchorDrag(null);
          if (onRegionAnchorCommit) {
            onRegionAnchorCommit(latest.regionId, { x: latest.nx, y: latest.ny });
          }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      } else {
        e.stopPropagation();
        onRegionSelect?.(regId);
      }
    },
    [
      clientToNorm,
      interactionMode,
      showAnchors,
      onRegionAnchorCommit,
      onRegionSelect,
      onBrightnessAnchorClick,
      getAnchorClientPosition,
    ]
  );

  const transitionGuideLines = useMemo(() => {
    if (interactionMode !== "create_transition") {
      return [] as { key: string; x1: number; y1: number; x2: number; y2: number }[];
    }
    const out: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const t of transitions) {
      const src = regionById.get(t.source_region_id);
      const tgt = regionById.get(t.target_region_id);
      if (!src || !tgt) continue;
      const ordered = orderedRegionIdsForTransition(t);
      const stopsAlongAxis = ordered
        .map((rid) => {
          const reg = regionById.get(rid);
          if (!reg) return null;
          return { aNorm: anchorNorm(reg), rgb: labColorFromJson(reg.color_json) };
        })
        .filter(Boolean) as { aNorm: { x: number; y: number }; rgb: [number, number, number] }[];
      if (stopsAlongAxis.length < 2) continue;
      const unionStrokeIds = [
        ...new Set(ordered.flatMap((rid) => regionById.get(rid)?.stroke_ids_json ?? [])),
      ];
      const spec = buildTransitionGradientSpec(
        box,
        medians,
        anchorNorm(src),
        anchorNorm(tgt),
        stopsAlongAxis,
        unionStrokeIds
      );
      out.push({ key: `tg-${t.id}`, x1: spec.x1, y1: spec.y1, x2: spec.x2, y2: spec.y2 });
    }
    if (transitionPreview) {
      const src = regionById.get(transitionPreview.sourceRegionId);
      if (src) {
        const an = anchorNorm(src);
        const endN = { x: transitionPreview.endNx, y: transitionPreview.endNy };
        const { x1, y1, x2, y2 } = gradientLineEndpointsForTransition(
          an,
          endN,
          box,
          medians,
          src.stroke_ids_json ?? [],
          [],
          [endN]
        );
        out.push({ key: "tg-preview", x1, y1, x2, y2 });
      }
    }
    return out;
  }, [
    interactionMode,
    transitions,
    regionById,
    transitionPreview,
    medians,
    box,
    anchorNorm,
  ]);

  const strokeIdsInMarquee = useCallback(
    (r: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const out: number[] = [];
      for (let i = 0; i < medians.length; i++) {
        const b = bboxFromMedianStroke(medians[i] ?? []);
        if (!b) continue;
        if (rectsIntersect(r, b)) out.push(i);
      }
      return out.sort((a, b) => a - b);
    },
    [medians]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setMarqueeHanzi(null);
  }, []);

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (interactionMode !== "select_strokes") return;
    const strokeEl = (e.target as Element | null)?.closest?.("[data-stroke-index]");
    const strokeIdx = strokeEl
      ? parseInt(strokeEl.getAttribute("data-stroke-index") ?? "", 10)
      : undefined;
    const h = clientToHanzi(e.clientX, e.clientY);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startHanziX: h.x,
      startHanziY: h.y,
      strokeIdx: Number.isFinite(strokeIdx) ? strokeIdx : undefined,
      marquee: false,
      marqueeRect: null,
    };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || interactionMode !== "select_strokes") return;
    if (!onMarqueeSelect) return;
    const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
    if (dist > DRAG_PX) {
      d.marquee = true;
      const cur = clientToHanzi(e.clientX, e.clientY);
      const x1 = Math.min(d.startHanziX, cur.x);
      const y1 = Math.min(d.startHanziY, cur.y);
      const x2 = Math.max(d.startHanziX, cur.x);
      const y2 = Math.max(d.startHanziY, cur.y);
      d.marqueeRect = { minX: x1, minY: y1, maxX: x2, maxY: y2 };
      setMarqueeHanzi({ x1, y1, x2, y2 });
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    const svg = e.currentTarget as SVGSVGElement;
    if (svg.hasPointerCapture?.(e.pointerId)) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (!d || interactionMode !== "select_strokes") {
      endDrag();
      return;
    }
    if (d.marquee && d.marqueeRect && onMarqueeSelect) {
      const ids = strokeIdsInMarquee(d.marqueeRect);
      onMarqueeSelect(ids, e.shiftKey ? "add" : "replace");
    } else if (!d.marquee && d.strokeIdx !== undefined) {
      onStrokeClick(d.strokeIdx);
    }
    endDrag();
  };

  const paperBg = "#faf8f5";
  const paperDot = paperStyle ? (
    <defs>
      <pattern id={dotPatternId} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.55" fill="#e8dfc4" opacity="0.55" />
      </pattern>
    </defs>
  ) : null;

  const flipTransform = `translate(0 ${HANZI_WRITER_VIEW_HEIGHT}) scale(1 -1)`;

  const anchorStroke = paperStyle ? "#faf8f5" : "#e5e7eb";
  const draggingTransition = Boolean(transitionPreview);
  const sourceIdForDrag = transitionPreview?.sourceRegionId;

  const previewGradId = `g-prev-${uid}`;

  const strokeFillForIndex = (i: number): string => {
    if (
      interactionMode === "select_strokes" &&
      draftPreviewHex &&
      selectedStrokeIds.includes(i)
    ) {
      const h = draftPreviewHex.replace(/^#/, "");
      return `#${h}`;
    }

    const base = fills[i] ?? "#3f3f46";
    if (previewMode !== "color" && previewMode !== "structure") return base;

    if (transitionPreview) {
      const src = regionById.get(transitionPreview.sourceRegionId);
      if (src && strokeInRegion(i, src)) {
        return `url(#${previewGradId})`;
      }
    }

    const tid = transitionIdForStroke[i];
    if (tid) {
      return `url(#g-tr-${uid}-${tid})`;
    }
    return base;
  };

  return (
    <div
      className={
        paperStyle
          ? "relative rounded-xl border border-stone-300/90 bg-[#f0e8dc] p-3 shadow-inner"
          : "relative rounded-xl p-1"
      }
    >
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="mx-auto block w-full touch-none select-none"
        style={{
          maxWidth: `min(95vw, ${CHINESE_TIANZIGE_DISPLAY_MAX_W_PX}px)`,
          maxHeight: `min(${CHINESE_TIANZIGE_DISPLAY_MAX_VH}vh, ${CHINESE_TIANZIGE_DISPLAY_MAX_H_PX}px)`,
        }}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerCancel={handleSvgPointerUp}
      >
        {paperDot}
        {paperStyle && (
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={paperBg}
          />
        )}
        {paperStyle && (
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={`url(#${dotPatternId})`} opacity={0.65} />
        )}
        {paperStyle && (
          <rect
            x={box.x + box.w * 0.02}
            y={box.y + box.h * 0.02}
            width={box.w * 0.96}
            height={box.h * 0.96}
            fill="none"
            stroke="#d4c4a8"
            strokeWidth={Math.max(1.5, box.w * 0.002)}
            strokeDasharray="8 6"
            rx={4}
            className="pointer-events-none"
          />
        )}
        {/* MiziGrid must live inside the flip group: same Hanzi y-up space as paths and anchors.
            Drawing the grid outside <g transform> used SVG y-down semantics for the same numeric
            box.* values, so the 田字 intersection did not match (cx, cy) in Hanzi — two "center"
            markers could not align. */}
        <g id="chinese-glyph-flip" transform={flipTransform}>
          <g ref={flipGroupRef} transform={hanziVisualScaleTransform}>
          {!paperStyle && <MiziGrid box={box} strokeW={gridStroke} />}
          <defs>
            {(previewMode === "color" || previewMode === "structure") &&
              transitions.map((t) => {
                const a = regionById.get(t.source_region_id);
                const b = regionById.get(t.target_region_id);
                if (!a || !b) return null;
                const ordered = orderedRegionIdsForTransition(t);
                const stopsAlongAxis = ordered
                  .map((rid) => {
                    const reg = regionById.get(rid);
                    if (!reg) return null;
                    return { aNorm: anchorNorm(reg), rgb: labColorFromJson(reg.color_json) };
                  })
                  .filter(Boolean) as { aNorm: { x: number; y: number }; rgb: [number, number, number] }[];
                if (stopsAlongAxis.length < 2) return null;
                const unionStrokeIds = [
                  ...new Set(ordered.flatMap((rid) => regionById.get(rid)?.stroke_ids_json ?? [])),
                ];
                const spec = buildTransitionGradientSpec(
                  box,
                  medians,
                  anchorNorm(a),
                  anchorNorm(b),
                  stopsAlongAxis,
                  unionStrokeIds
                );
                const gid = `g-tr-${uid}-${t.id}`;
                return (
                  <linearGradient
                    key={gid}
                    id={gid}
                    gradientUnits="userSpaceOnUse"
                    x1={spec.x1}
                    y1={spec.y1}
                    x2={spec.x2}
                    y2={spec.y2}
                  >
                    {spec.stops.map((st, j) => (
                      <stop
                        key={`${gid}-s-${j}`}
                        offset={`${st.offsetPct}%`}
                        stopColor={`rgb(${st.r},${st.g},${st.b})`}
                      />
                    ))}
                  </linearGradient>
                );
              })}

            {(previewMode === "color" || previewMode === "structure") &&
              transitionPreview &&
              (() => {
                const src = regionById.get(transitionPreview.sourceRegionId);
                if (!src) return null;
                const an = anchorNorm(src);
                const endN = { x: transitionPreview.endNx, y: transitionPreview.endNy };
                const { x1, y1, x2, y2 } = gradientLineEndpointsForTransition(
                  an,
                  endN,
                  box,
                  medians,
                  src.stroke_ids_json ?? [],
                  [],
                  [endN]
                );
                const [r0, g0, b0] = labColorFromJson(src.color_json);
                return (
                  <linearGradient
                    id={previewGradId}
                    gradientUnits="userSpaceOnUse"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                  >
                    <stop offset="0%" stopColor={`rgb(${r0},${g0},${b0})`} stopOpacity={0.92} />
                    <stop offset="100%" stopColor={`rgb(${r0},${g0},${b0})`} stopOpacity={0.06} />
                  </linearGradient>
                );
              })()}
          </defs>

          {strokes.map((d, i) => {
            const sel = selectedStrokeIds.includes(i);
            let dim =
              interactionMode === "select_strokes" && selectedStrokeIds.length > 0 && !sel ? 0.35 : 1;
            if (draggingTransition) dim *= 0.55;
            const fill = strokeFillForIndex(i);
            const previewing = Boolean(
              interactionMode === "select_strokes" && draftPreviewHex && sel
            );
            return (
              <path
                key={i}
                data-stroke-index={i}
                d={d}
                fill={fill}
                fillOpacity={previewing ? 0.92 : dim}
                stroke={
                  sel
                    ? previewing
                      ? "rgba(255,255,255,0.35)"
                      : "#f59e0b"
                    : "rgba(0,0,0,0.08)"
                }
                strokeWidth={sel ? (previewing ? 1.2 : 3) : 0.8}
                className={
                  interactionMode === "select_strokes"
                    ? "cursor-crosshair"
                    : interactionMode === "create_transition"
                      ? "cursor-pointer"
                      : "pointer-events-none"
                }
                style={{
                  pointerEvents:
                    interactionMode === "select_strokes" || interactionMode === "create_transition"
                      ? "auto"
                      : "none",
                }}
                onDoubleClick={
                  interactionMode === "create_transition" && onTransitionStrokeDoubleClick
                    ? (e) => {
                        e.stopPropagation();
                        onTransitionStrokeDoubleClick(i);
                      }
                    : undefined
                }
              />
            );
          })}

          {marqueeHanzi && (
            <rect
              x={marqueeHanzi.x1}
              y={marqueeHanzi.y1}
              width={marqueeHanzi.x2 - marqueeHanzi.x1}
              height={marqueeHanzi.y2 - marqueeHanzi.y1}
              fill="rgba(59,130,246,0.12)"
              stroke="rgba(59,130,246,0.75)"
              strokeWidth={Math.max(1, box.w * 0.002)}
              strokeDasharray="4 3"
              className="pointer-events-none"
            />
          )}

          {paperStyle &&
            previewMode === "structure" &&
            medians.map((stroke, i) => (
              <polyline
                key={`m-${i}`}
                points={stroke.map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="none"
                stroke="rgba(180,170,150,0.22)"
                strokeWidth={0.9}
                className="pointer-events-none"
              />
            ))}

          {previewMode === "structure" &&
            viewRegions.flatMap((reg) => {
              const ids = reg.stroke_ids_json ?? [];
              return ids.map((si) => {
                const stroke = medians[si];
                if (!stroke) return null;
                return (
                  <polyline
                    key={`hl-${reg.id}-${si}`}
                    points={stroke.map((p) => `${p[0]},${p[1]}`).join(" ")}
                    fill="none"
                    stroke="rgba(234,88,12,0.75)"
                    strokeWidth={3}
                    className="pointer-events-none"
                  />
                );
              });
            })}

          {interactionMode === "create_transition" &&
            transitionGuideLines.map((ln) => (
              <line
                key={ln.key}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                stroke="rgba(56,189,248,0.55)"
                strokeWidth={Math.max(1.2, box.w * 0.002)}
                strokeDasharray={`${box.w * 0.012} ${box.w * 0.008}`}
                strokeLinecap="round"
                className="pointer-events-none"
              />
            ))}

          {showAnchors &&
            viewRegions.map((reg) => {
              const an = anchorNorm(reg);
              const ax = box.x + an.x * box.w;
              const ay = box.y + an.y * box.h;
              const active = reg.id === selectedRegionId;
              const isSource = draggingTransition && sourceIdForDrag === reg.id;
              const isHoverTarget = hoverTargetRegionId === reg.id;
              const r = isSource ? 11 : active ? 8 : isHoverTarget ? 9 : 5.5;
              return (
                <g key={`anchor-${reg.id}`}>
                  {isHoverTarget && !isSource && (
                    <circle
                      cx={ax}
                      cy={ay}
                      r={r + 6}
                      fill="none"
                      stroke="rgba(56,189,248,0.65)"
                      strokeWidth={2}
                      className="pointer-events-none"
                    />
                  )}
                  <circle
                    cx={ax}
                    cy={ay}
                    r={r}
                    fill={isSource ? "#fbbf24" : active ? "#1c1917" : isHoverTarget ? "#57534e" : "#78716c"}
                    stroke={anchorStroke}
                    strokeWidth={isSource ? 2.2 : 1.5}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={ax}
                    cy={ay}
                    r={r + 12}
                    fill="transparent"
                    className="cursor-pointer"
                    style={{
                      pointerEvents:
                        interactionMode === "create_transition" ||
                        (interactionMode === "select_strokes" && onBrightnessAnchorClick)
                          ? "auto"
                          : "none",
                    }}
                    onPointerDown={(e) => handleAnchorPointerDown(e, reg.id)}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
});

GlyphCanvas.displayName = "GlyphCanvas";
