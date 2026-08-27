import type { Vector3Tuple } from "three";

export type ViewpointPreset = {
  id: string;
  label: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
};

/**
 * Cameras for a large suspended cluster: farther z + slightly low target = upper-middle mass on screen.
 */
export const VIEWPOINT_PRESETS: ViewpointPreset[] = [
  {
    id: "threshold",
    label: "Threshold",
    position: [0, -0.28, 17.2],
    target: [0, -0.48, 0],
  },
  {
    id: "oblique",
    label: "Oblique",
    position: [11.5, 1.1, 12.8],
    target: [0, -0.42, 0],
  },
  {
    id: "proximity",
    label: "Proximity",
    position: [0, -0.08, 12.4],
    target: [0, -0.45, 0],
  },
];
