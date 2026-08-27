import { create } from "zustand";

/** 选笔画与颜色 · 过渡效果（无单独「空闲」按钮时仍可用 idle 作内部默认） */
export type InteractionMode = "idle" | "select_strokes" | "create_transition";
export type PreviewMode = "structure" | "color";

export type TransitionDragState = {
  sourceRegionId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
} | null;

interface ChineseUiState {
  interactionMode: InteractionMode;
  previewMode: PreviewMode;
  selectedStrokeIds: number[];
  selectedRegionId: string | null;
  transitionDrag: TransitionDragState;
  setInteractionMode: (m: InteractionMode) => void;
  setPreviewMode: (m: PreviewMode) => void;
  toggleStroke: (id: number) => void;
  /** 框选或程序化替换当前选中的笔画集合 */
  setSelectedStrokeIds: (ids: number[]) => void;
  clearStrokeSelection: () => void;
  setSelectedRegionId: (id: string | null) => void;
  setTransitionDrag: (d: TransitionDragState) => void;
  updateTransitionDragPointer: (clientX: number, clientY: number) => void;
}

export const useChineseUiStore = create<ChineseUiState>((set) => ({
  interactionMode: "select_strokes",
  previewMode: "color",
  selectedStrokeIds: [],
  selectedRegionId: null,
  transitionDrag: null,
  setInteractionMode: (m) => set({ interactionMode: m }),
  setPreviewMode: (m) => set({ previewMode: m }),
  toggleStroke: (id) =>
    set((s) => ({
      selectedStrokeIds: s.selectedStrokeIds.includes(id)
        ? s.selectedStrokeIds.filter((x) => x !== id)
        : [...s.selectedStrokeIds, id].sort((a, b) => a - b),
    })),
  setSelectedStrokeIds: (ids) =>
    set({ selectedStrokeIds: [...new Set(ids)].filter((x) => x >= 0).sort((a, b) => a - b) }),
  clearStrokeSelection: () => set({ selectedStrokeIds: [] }),
  setSelectedRegionId: (id) => set({ selectedRegionId: id }),
  setTransitionDrag: (d) => set({ transitionDrag: d }),
  updateTransitionDragPointer: (clientX, clientY) =>
    set((s) =>
      s.transitionDrag
        ? { transitionDrag: { ...s.transitionDrag, currentX: clientX, currentY: clientY } }
        : {}
    ),
}));
