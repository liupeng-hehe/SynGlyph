import type { NeuralCluster, NeuralClusterId } from "./synesthesiaTypeFlows";

/** Deterministic seeded PRNG — stable across server and client. */
function createRng(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function curvePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend: number,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx1 = mx - dy * bend;
  const cy1 = my + dx * bend;
  const cx2 = mx + dy * bend * 0.6;
  const cy2 = my - dx * bend * 0.6;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const SENSE_COLORS = [
  "#B7C7FF",
  "#FFB6B6",
  "#00B8D9",
  "#C9B7FF",
  "#FFD447",
  "#2ECC71",
  "#FF9F1C",
  "#FF8A3D",
  "#7B61FF",
  "#FF4FD8",
  "#86D9FF",
  "#A6E37D",
];

/** ~150 faint background neural fibers. */
export function generateBackgroundFibers(count = 150): {
  d: string;
  color?: string;
  width: number;
}[] {
  const rand = createRng(73129);
  const fibers: { d: string; color?: string; width: number }[] = [];

  for (let i = 0; i < count; i++) {
    const x1 = 110 + rand() * 620;
    const y1 = 95 + rand() * 380;
    const len = 40 + rand() * 120;
    const angle = rand() * Math.PI * 2;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;
    const bend = 0.15 + rand() * 0.35;
    const useColor = i % 11 === 0;
    fibers.push({
      d: curvePath(x1, y1, x2, y2, bend),
      color: useColor ? SENSE_COLORS[i % SENSE_COLORS.length] : undefined,
      width: 0.8 + rand() * 0.4,
    });
  }

  return fibers;
}

const CLUSTER_SEEDS: Record<NeuralClusterId, number> = {
  visualInput: 101,
  graphemeRecognition: 203,
  colorProcessing: 307,
  auditoryProcessing: 409,
  parietalBinding: 503,
  spatialMapping: 607,
  semanticLanguage: 709,
  gustatoryInsula: 811,
  somatosensoryMap: 913,
  mirrorTouchNetwork: 1019,
  conceptualAssociation: 1123,
  motorBodyMapping: 1229,
  attentionModulation: 1331,
};

/** Branching strokes around a cluster center — dense local bundle. */
export function generateClusterBranches(
  cx: number,
  cy: number,
  clusterId: NeuralClusterId,
  count = 14,
): string[] {
  const rand = createRng(CLUSTER_SEEDS[clusterId]);
  const branches: string[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
    const len = 12 + rand() * 28;
    const x1 = cx + Math.cos(angle) * (3 + rand() * 6);
    const y1 = cy + Math.sin(angle) * (3 + rand() * 6);
    const x2 = cx + Math.cos(angle + (rand() - 0.5) * 0.5) * len;
    const y2 = cy + Math.sin(angle + (rand() - 0.5) * 0.5) * len;
    const bend = 0.2 + rand() * 0.25;
    branches.push(curvePath(x1, y1, x2, y2, bend));
  }

  return branches;
}

/** Tiny node dots around cluster center. */
export function generateClusterDots(
  cx: number,
  cy: number,
  clusterId: NeuralClusterId,
  count = 8,
): { x: number; y: number; r: number }[] {
  const rand = createRng(CLUSTER_SEEDS[clusterId] + 17);
  const dots: { x: number; y: number; r: number }[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * 18;
    dots.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: 1 + rand() * 1.2,
    });
  }

  return dots;
}

/** Precomputed cluster visuals keyed by id. */
export function buildClusterVisuals(
  clusters: NeuralCluster[],
): Record<
  NeuralClusterId,
  { branches: string[]; dots: { x: number; y: number; r: number }[] }
> {
  return Object.fromEntries(
    clusters.map((c) => [
      c.id,
      {
        branches: generateClusterBranches(c.x, c.y, c.id),
        dots: generateClusterDots(c.x, c.y, c.id),
      },
    ]),
  ) as Record<
    NeuralClusterId,
    { branches: string[]; dots: { x: number; y: number; r: number }[] }
  >;
}

/** Multiple parallel fiber-like paths between two points. */
export function buildPathwayFibers(
  from: { x: number; y: number },
  to: { x: number; y: number },
  seed: number,
  strands = 4,
): string[] {
  const rand = createRng(seed);
  const paths: string[] = [];

  for (let i = 0; i < strands; i++) {
    const offset = (i - (strands - 1) / 2) * 6;
    const fx = from.x + offset * 0.3;
    const fy = from.y + offset * 0.5;
    const tx = to.x + offset * 0.25;
    const ty = to.y + offset * 0.4;
    const bend = 0.25 + rand() * 0.2 + i * 0.04;
    paths.push(curvePath(fx, fy, tx, ty, bend));
  }

  return paths;
}

export const backgroundFibers = generateBackgroundFibers(150);
