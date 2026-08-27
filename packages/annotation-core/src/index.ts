/**
 * Shared low-level specs only — no English/Chinese business logic.
 */

export type ColorSpace = "oklch" | "lab" | "rgb" | "hex";

export type ColorSpec = {
  space: ColorSpace;
  value: number[] | string;
  alpha?: number;
};

export type AnchorSpec = {
  x: number;
  y: number;
};

export type SpreadSpec = {
  sx: number;
  sy: number;
  theta?: number;
  softness?: number;
};

export type DirectedTransitionCurve = {
  type: "line" | "bezier";
  controlPoints?: { x: number; y: number }[];
};

export type DirectedTransitionSpec = {
  sourceId: string;
  targetId: string;
  strength: number;
  width: number;
  falloff: number;
  curve?: DirectedTransitionCurve;
};
