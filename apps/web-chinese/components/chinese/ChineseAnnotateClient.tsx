"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToLab, labToHex } from "@synglyph/shared";
import { GrainientBg } from "@/components/GrainientBg";
import {
  createChineseRegion,
  createChineseTransition,
  deleteChineseRegion,
  deleteChineseTransition,
  fetchChineseGlyph,
  getChineseSession,
  patchChineseRegion,
  patchChineseTransition,
} from "@/lib/apiChinese";
import { useChineseUiStore } from "@/lib/chineseStore";
import type { ChineseGlyphResponse } from "@/lib/apiChinese";
import { GlyphCanvas, type GlyphCanvasHandle, type RegionView, type TransitionView } from "./GlyphCanvas";
import { RegionPanel } from "./RegionPanel";
import { TransitionPanel } from "./TransitionPanel";
import { ColorWheelPicker } from "./ColorWheelPicker";
import { BrightnessArcPicker } from "./BrightnessArcPicker";
import { mergeStrokeFillsFromRegions, strokeFillsFromTemplate } from "@/lib/glyphStrokeColors";
import {
  CHINESE_GLYPH_VIEW_PAD,
  CHINESE_TIANZIGE_DISPLAY_MAX_W_PX,
  normalizedAnchorFromStrokeMedians,
  regionAnchorNorm,
  sortRegionIdsOnTransitionAxis,
  squareCenteredViewBoxFromMedians,
} from "@/lib/chineseGlyphLayout";

function mapRegion(r: Record<string, unknown>): RegionView {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "region",
    stroke_ids_json: (r.stroke_ids_json as number[] | null) ?? null,
    polygon_json: (r.polygon_json as { x: number; y: number }[] | null) ?? null,
    anchor_json: (r.anchor_json as { x: number; y: number }) ?? { x: 0.5, y: 0.5 },
    color_json: (r.color_json as RegionView["color_json"]) ?? { space: "lab", value: [70, 0, 0] },
    spread_json: (r.spread_json as RegionView["spread_json"]) ?? { sx: 0.28, sy: 0.28 },
    intensity: typeof r.intensity === "number" ? r.intensity : 1,
  };
}

function mapTransition(t: Record<string, unknown>): TransitionView {
  return {
    id: t.id as string,
    source_region_id: t.source_region_id as string,
    target_region_id: t.target_region_id as string,
    strength: typeof t.strength === "number" ? t.strength : 1,
    width: typeof t.width === "number" ? t.width : 0.25,
    falloff: typeof t.falloff === "number" ? t.falloff : 0.5,
    curve_json: (t.curve_json as TransitionView["curve_json"]) ?? null,
  };
}

type Props = { sessionId: string };

const CHECKER =
  "bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#ffffff_0%_50%)_50%_/_20px_20px]";

/** 中文仅标颜色：固定中等扩散与强度 */
function defaultRegionColorParams() {
  const spread = 0.5;
  const t = 0.08 + Math.max(0, Math.min(1, spread)) * 0.5;
  const intensity = 0.35 + 0.5 * 1.15;
  return {
    spread_json: { sx: t, sy: t },
    intensity,
  };
}

export function ChineseAnnotateClient({ sessionId }: Props) {
  const router = useRouter();
  const [glyph, setGlyph] = useState<ChineseGlyphResponse["template"] | null>(null);
  const [glyphInstanceId, setGlyphInstanceId] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [transitions, setTransitions] = useState<TransitionView[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [draftColorHex, setDraftColorHex] = useState("6b8cae");
  const [brightnessPicker, setBrightnessPicker] = useState<{
    regionId: string;
    left: number;
    top: number;
  } | null>(null);
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const glyphCanvasRef = useRef<GlyphCanvasHandle | null>(null);
  const glyphInstanceIdRef = useRef<string | null>(null);
  const transitionsRef = useRef(transitions);
  glyphInstanceIdRef.current = glyphInstanceId;
  transitionsRef.current = transitions;

  const interactionMode = useChineseUiStore((s) => s.interactionMode);
  const previewMode = useChineseUiStore((s) => s.previewMode);
  const selectedStrokeIds = useChineseUiStore((s) => s.selectedStrokeIds);
  const selectedRegionId = useChineseUiStore((s) => s.selectedRegionId);
  const transitionDrag = useChineseUiStore((s) => s.transitionDrag);
  const isDraggingTransition = transitionDrag !== null;
  const setInteractionMode = useChineseUiStore((s) => s.setInteractionMode);
  const setPreviewMode = useChineseUiStore((s) => s.setPreviewMode);
  const toggleStroke = useChineseUiStore((s) => s.toggleStroke);
  const clearStrokeSelection = useChineseUiStore((s) => s.clearStrokeSelection);
  const setSelectedStrokeIds = useChineseUiStore((s) => s.setSelectedStrokeIds);
  const setSelectedRegionId = useChineseUiStore((s) => s.setSelectedRegionId);
  const setTransitionDragState = useChineseUiStore((s) => s.setTransitionDrag);
  const updateTransitionDragPointer = useChineseUiStore((s) => s.updateTransitionDragPointer);

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const sess = await getChineseSession(sessionId);
      const gi = sess.glyph_instances[0];
      if (!gi) {
        setMessage("会话中没有字形实例");
        return;
      }
      setGlyphInstanceId(gi.id);
      const g = await fetchChineseGlyph(gi.character);
      setGlyph(g.template);
      setRegions((gi.regions as Record<string, unknown>[]).map(mapRegion));
      setTransitions((gi.transitions as Record<string, unknown>[]).map(mapTransition));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const regionNames = useMemo(() => {
    const m: Record<string, string> = {};
    regions.forEach((r) => {
      m[r.id] = r.name;
    });
    return m;
  }, [regions]);

  const strokeFills = useMemo(() => {
    if (!glyph) return [];
    const base = strokeFillsFromTemplate(glyph);
    return mergeStrokeFillsFromRegions(base, regions);
  }, [glyph, regions]);

  const grainientColors = useMemo(() => {
    return regions.slice(0, 8).map((r) => {
      try {
        const v = r.color_json?.value as number[] | undefined;
        if (!v || v.length < 3) return "606060";
        return labToHex(v[0]!, v[1]!, v[2]!);
      } catch {
        return "606060";
      }
    });
  }, [regions]);

  const layoutBox = useMemo(
    () => (glyph ? squareCenteredViewBoxFromMedians(glyph.medians, CHINESE_GLYPH_VIEW_PAD) : null),
    [glyph]
  );

  const findRegionAt = useCallback(
    (nx: number, ny: number): string | null => {
      if (!glyph || !layoutBox) return null;
      let best: { id: string; d: number } | null = null;
      for (const r of regions) {
        const ac = regionAnchorNorm(r, glyph.medians, layoutBox);
        const dx = ac.x - nx;
        const dy = ac.y - ny;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { id: r.id, d };
      }
      if (best && best.d < 0.02) return best.id;
      return null;
    },
    [regions, glyph, layoutBox]
  );

  const transitionPreview = useMemo(() => {
    if (!transitionDrag) return null;
    const { nx, ny } =
      glyphCanvasRef.current?.clientToNorm(transitionDrag.currentX, transitionDrag.currentY) ?? {
        nx: 0.5,
        ny: 0.5,
      };
    return {
      sourceRegionId: transitionDrag.sourceRegionId,
      endNx: nx,
      endNy: ny,
    };
  }, [transitionDrag]);

  const hoverTargetRegionId = useMemo(() => {
    if (!transitionDrag) return null;
    const { nx, ny } =
      glyphCanvasRef.current?.clientToNorm(transitionDrag.currentX, transitionDrag.currentY) ?? {
        nx: 0.5,
        ny: 0.5,
      };
    return findRegionAt(nx, ny);
  }, [transitionDrag, findRegionAt]);

  useEffect(() => {
    if (!isDraggingTransition) return;
    const move = (e: PointerEvent) => {
      updateTransitionDragPointer(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const gi = glyphInstanceIdRef.current;
      const d = useChineseUiStore.getState().transitionDrag;
      if (!d || !gi) {
        setTransitionDragState(null);
        return;
      }
      const { nx, ny } = glyphCanvasRef.current?.clientToNorm(e.clientX, e.clientY) ?? {
        nx: 0.5,
        ny: 0.5,
      };
      const targetId = findRegionAt(nx, ny);
      if (targetId && targetId !== d.sourceRegionId) {
        void (async () => {
          try {
            const ids = transitionsRef.current.map((t) => t.id);
            await Promise.all(ids.map((id) => deleteChineseTransition(id)));
            const t = await createChineseTransition({
              glyph_instance_id: gi,
              source_region_id: d.sourceRegionId,
              target_region_id: targetId,
              mode: "directed_flow",
              strength: 1,
              width: 0.28,
              falloff: 0.5,
            });
            setTransitions([mapTransition(t as Record<string, unknown>)]);
          } catch (err) {
            setMessage(err instanceof Error ? err.message : String(err));
          }
        })();
      }
      setTransitionDragState(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [isDraggingTransition, findRegionAt, setTransitionDragState, updateTransitionDragPointer, setMessage]);

  const handleMarqueeSelect = useCallback(
    (ids: number[], mode: "replace" | "add") => {
      if (mode === "replace") {
        setSelectedStrokeIds(ids);
        return;
      }
      const prev = useChineseUiStore.getState().selectedStrokeIds;
      setSelectedStrokeIds([...new Set([...prev, ...ids])].sort((a, b) => a - b));
    },
    [setSelectedStrokeIds]
  );

  const handleCreateFromStrokes = async () => {
    if (!glyphInstanceId || !glyph || selectedStrokeIds.length === 0) return;
    setMessage("");
    let lab: [number, number, number];
    try {
      const v = hexToLab(draftColorHex.replace(/^#/, ""));
      lab = [v[0]!, v[1]!, v[2]!];
    } catch {
      lab = [65, 5, -8];
    }
    const { spread_json, intensity } = defaultRegionColorParams();
    try {
      const vb = squareCenteredViewBoxFromMedians(glyph.medians, CHINESE_GLYPH_VIEW_PAD);
      const anchor = normalizedAnchorFromStrokeMedians(glyph.medians, selectedStrokeIds, vb);
      const created = await createChineseRegion({
        glyph_instance_id: glyphInstanceId,
        name: `区域-${regions.length + 1}`,
        selection_mode: "stroke_group",
        stroke_ids_json: selectedStrokeIds,
        anchor_json: { x: anchor.x, y: anchor.y },
        color_json: { space: "lab", value: lab },
        spread_json,
        intensity,
        z_index: regions.length,
      });
      clearStrokeSelection();
      setRegions((prev) => [...prev, mapRegion(created as Record<string, unknown>)]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteRegion = async (id: string) => {
    try {
      await deleteChineseRegion(id);
      setRegions((prev) => prev.filter((r) => r.id !== id));
      setTransitions((prev) =>
        prev.filter((t) => t.source_region_id !== id && t.target_region_id !== id)
      );
      if (selectedRegionId === id) setSelectedRegionId(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRegionAnchorCommit = useCallback(
    async (regionId: string, norm: { x: number; y: number }) => {
      try {
        await patchChineseRegion(regionId, { anchor_json: norm });
        setRegions((prev) =>
          prev.map((r) => (r.id === regionId ? { ...r, anchor_json: norm } : r))
        );
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    },
    []
  );

  const handleRegionSelect = useCallback(
    (id: string) => {
      setSelectedRegionId(id);
    },
    [setSelectedRegionId]
  );

  const openBrightnessPickerAt = useCallback(
    (regionId: string, left: number, top: number) => {
      setSelectedRegionId(regionId);
      setBrightnessPicker({ regionId, left, top });
    },
    [setSelectedRegionId]
  );

  const handleBrightnessAnchorClick = useCallback(
    (regionId: string, clientX: number, clientY: number) => {
      openBrightnessPickerAt(regionId, clientX, clientY);
    },
    [openBrightnessPickerAt]
  );

  const brightnessPickerLab = useMemo((): [number, number, number] => {
    if (!brightnessPicker) return [70, 0, 0];
    const r = regions.find((x) => x.id === brightnessPicker.regionId);
    const v = r?.color_json?.value;
    if (Array.isArray(v) && v.length >= 3) {
      return [Number(v[0]), Number(v[1]), Number(v[2])];
    }
    return [70, 0, 0];
  }, [brightnessPicker, regions]);

  const handleBrightnessLabChange = useCallback(
    (lab: [number, number, number]) => {
      if (!brightnessPicker) return;
      setRegions((prev) =>
        prev.map((r) =>
          r.id === brightnessPicker.regionId ? { ...r, color_json: { space: "lab", value: lab } } : r
        )
      );
    },
    [brightnessPicker]
  );

  const persistRegionLab = useCallback(async (regionId: string, lab: [number, number, number]) => {
    try {
      await patchChineseRegion(regionId, { color_json: { space: "lab", value: lab } });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleBrightnessCommit = useCallback(
    async (lab: [number, number, number]) => {
      const id = brightnessPicker?.regionId;
      if (!id) return;
      await persistRegionLab(id, lab);
    },
    [brightnessPicker, persistRegionLab]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.key !== "b" && e.key !== "B") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (brightnessPicker) return;
      e.preventDefault();
      const id = useChineseUiStore.getState().selectedRegionId;
      if (!id) return;
      const p = glyphCanvasRef.current?.getAnchorClientPosition(id);
      if (p) {
        openBrightnessPickerAt(id, p.x, p.y);
        return;
      }
      const wrap = document.getElementById("chinese-glyph-svg-wrap");
      if (wrap) {
        const rr = wrap.getBoundingClientRect();
        openBrightnessPickerAt(id, rr.left + rr.width / 2, rr.top + rr.height / 2);
      } else {
        openBrightnessPickerAt(id, window.innerWidth / 2, 200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [brightnessPicker, openBrightnessPickerAt]);

  const handleTransitionStrokeDoubleClick = useCallback(
    async (strokeIndex: number) => {
      if (transitions.length !== 1 || !glyph || !layoutBox) return;
      const t = transitions[0];
      const region = regions.find((r) => r.stroke_ids_json?.includes(strokeIndex));
      if (!region) return;
      const cur = t.curve_json?.ordered_region_ids;
      const base =
        cur &&
        cur.length >= 2 &&
        cur.includes(t.source_region_id) &&
        cur.includes(t.target_region_id)
          ? [...cur]
          : [t.source_region_id, t.target_region_id];
      if (base.includes(region.id)) return;
      const merged = sortRegionIdsOnTransitionAxis(
        [...base, region.id],
        t.source_region_id,
        t.target_region_id,
        regions,
        glyph.medians,
        layoutBox
      );
      try {
        const updated = await patchChineseTransition(t.id, {
          curve_json: { ordered_region_ids: merged },
        });
        setTransitions([mapTransition(updated as Record<string, unknown>)]);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [transitions, glyph, layoutBox, regions]
  );

  const handleDeleteTransition = async (id: string) => {
    try {
      await deleteChineseTransition(id);
      setTransitions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (interactionMode !== "create_transition" || !(e.metaKey || e.ctrlKey)) return;
    if (!selectedRegionId || !glyphInstanceId) return;
    e.preventDefault();
    setTransitionDragState({
      sourceRegionId: selectedRegionId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
  };

  if (loading && !glyph) {
    return (
      <GrainientBg colors={[]} className="-m-6 min-h-screen">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-white/70">加载中…</p>
        </div>
      </GrainientBg>
    );
  }

  if (!glyph || !glyphInstanceId) {
    return (
      <GrainientBg colors={[]} className="-m-6 min-h-screen">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
          <p className="text-amber-200/90">{message || "无法加载字形"}</p>
          <Link
            href="/chinese"
            className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            ← 返回主菜单
          </Link>
        </div>
      </GrainientBg>
    );
  }

  return (
    <GrainientBg colors={grainientColors} className="-m-6 min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-28 pt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/chinese"
            className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            ← 返回主菜单
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm text-white/90 hover:bg-white/15"
              onClick={() => setPreviewMode(previewMode === "structure" ? "color" : "structure")}
            >
              预览：{previewMode === "structure" ? "结构" : "颜色场"}
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white shadow hover:bg-emerald-600"
              onClick={() => reload()}
            >
              重新加载
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div
            className="flex min-w-0 flex-1 flex-col items-stretch gap-3"
            style={{ maxWidth: `min(95vw, ${CHINESE_TIANZIGE_DISPLAY_MAX_W_PX}px)` }}
          >
            <div
              id="chinese-glyph-svg-wrap"
              className={`w-full rounded-xl p-1 ${CHECKER}`}
              style={{ maxWidth: `min(95vw, ${CHINESE_TIANZIGE_DISPLAY_MAX_W_PX}px)` }}
              onPointerDown={onCanvasPointerDown}
            >
              <GlyphCanvas
                ref={glyphCanvasRef}
                medians={glyph.medians}
                strokes={glyph.strokes}
                strokeFills={strokeFills}
                variant="mizi"
                viewRegions={regions}
                transitions={transitions}
                interactionMode={interactionMode}
                previewMode={previewMode}
                selectedStrokeIds={selectedStrokeIds}
                selectedRegionId={selectedRegionId}
                showAnchors={
                  interactionMode === "select_strokes" || interactionMode === "create_transition"
                }
                transitionPreview={transitionPreview}
                hoverTargetRegionId={hoverTargetRegionId}
                draftPreviewHex={draftColorHex}
                onMarqueeSelect={handleMarqueeSelect}
                onStrokeClick={(i) => toggleStroke(i)}
                onRegionAnchorCommit={handleRegionAnchorCommit}
                onRegionSelect={handleRegionSelect}
                onBrightnessAnchorClick={
                  interactionMode === "select_strokes" ? handleBrightnessAnchorClick : undefined
                }
                onTransitionStrokeDoubleClick={handleTransitionStrokeDoubleClick}
              />
            </div>

            <div className="mt-1 w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-[#14141c]/80 p-4 text-white/90 backdrop-blur">
              <RegionPanel
                tone="dark"
                regions={regions}
                selectedId={selectedRegionId}
                onSelect={setSelectedRegionId}
                onDelete={handleDeleteRegion}
              />
              <TransitionPanel
                tone="dark"
                transitions={transitions}
                regionNames={regionNames}
                onDelete={handleDeleteTransition}
              />
            </div>
          </div>

          <aside className="flex w-full max-w-[min(92vw,480px)] flex-col gap-3 lg:sticky lg:top-6 lg:w-[min(100%,360px)] lg:shrink-0 lg:pt-24">
            <div className="flex flex-wrap gap-2">
              <ModeBtn
                active={interactionMode === "select_strokes"}
                onClick={() => setInteractionMode("select_strokes")}
              >
                选笔画与颜色
              </ModeBtn>
              <ModeBtn
                active={interactionMode === "create_transition"}
                onClick={() => setInteractionMode("create_transition")}
              >
                过渡效果
              </ModeBtn>
            </div>
            {interactionMode === "select_strokes" && (
              <div className="space-y-3 rounded-xl border border-white/15 bg-[#1a1a24]/90 p-4 text-white/90">
                <p className="text-xs text-white/55">
                  新建区域颜色（点击笔画后创建区域时使用）。已建区域：点击部件<strong>小圆点</strong>，明暗半环<strong>圆心与该点重合</strong>；或选中区域后按{" "}
                  <kbd className="rounded bg-white/15 px-1">B</kbd>
                  在锚点处打开。沿半圆拖动即可调明暗。
                </p>
                <ColorWheelPicker value={draftColorHex} onChange={(h) => setDraftColorHex(h)} brightnessLabel="明度" />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500"
                    onClick={handleCreateFromStrokes}
                  >
                    用所选笔画创建区域
                  </button>
                  <button
                    type="button"
                    className="rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white/90 hover:bg-white/15"
                    onClick={clearStrokeSelection}
                  >
                    清除笔画选择
                  </button>
                </div>
              </div>
            )}
            {interactionMode === "create_transition" && (
              <p className="rounded-xl border border-white/10 bg-[#14141c]/60 p-4 text-xs leading-relaxed text-white/55">
                在左侧列表选中源区域；点击锚点可选中区域。按住 Shift 拖动锚点会实时改变过渡色标位置与渐变范围。双击某区域笔画可将该区域加入当前过渡链（多段颜色，按轴排序）。按住 Cmd / Ctrl
                从源锚点拖向目标锚点创建过渡；虚线表示渐变轴线。每次新建会覆盖之前的过渡。
              </p>
            )}
          </aside>
        </div>

        {brightnessPicker && (
          <BrightnessArcPicker
            open
            anchorLeft={brightnessPicker.left}
            anchorTop={brightnessPicker.top}
            lab={brightnessPickerLab}
            onLabChange={handleBrightnessLabChange}
            onCommit={handleBrightnessCommit}
            onClose={() => setBrightnessPicker(null)}
          />
        )}

        {message && <p className="mt-4 text-center text-sm text-amber-200/90">{message}</p>}

        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/chinese")}
            className="rounded-full bg-sky-600 px-8 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            完成并返回主菜单
          </button>
          <p className="max-w-md text-center text-xs text-white/45">
            区域与过渡在创建时已写入服务器；本按钮仅结束本页编辑并返回列表，不会额外打包文件。若需导出数据集，请使用控制台或后续导出流程。
          </p>
        </div>
      </div>
    </GrainientBg>
  );
}

function ModeBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active ? "bg-white/25 text-white" : "bg-white/10 text-white/85 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}
