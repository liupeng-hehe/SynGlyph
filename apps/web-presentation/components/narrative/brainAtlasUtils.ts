import {
  brainMeshAliases,
  type BrainRegion3DId,
} from "@/content/synesthesia3DFlows";

export function resolveRegionForMeshName(
  meshName: string,
): BrainRegion3DId | null {
  const lower = meshName.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best: { id: BrainRegion3DId; score: number } | null = null;

  for (const [id, aliases] of Object.entries(brainMeshAliases)) {
    for (const alias of aliases) {
      const normalized = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normalized) continue;
      const matches =
        lower === normalized ||
        lower.includes(normalized) ||
        normalized.includes(lower);
      if (matches && (!best || normalized.length > best.score)) {
        best = { id: id as BrainRegion3DId, score: normalized.length };
      }
    }
  }

  return best?.id ?? null;
}

/** Sequential pathway activation intensities (0–1) per region index. */
export function getPathwayActivationIntensities(
  regionCount: number,
  phase: number,
  reducedMotion: boolean,
): number[] {
  if (regionCount === 0) return [];
  if (reducedMotion) {
    return Array.from({ length: regionCount }, () => 1);
  }

  const holdPhase = regionCount;
  const effectivePhase = phase % (holdPhase + 1);

  if (effectivePhase >= holdPhase) {
    return Array.from({ length: regionCount }, (_, i) =>
      i === regionCount - 1 ? 1 : 0.5,
    );
  }

  return Array.from({ length: regionCount }, (_, i) => {
    if (i < effectivePhase) return 0.5;
    if (i === effectivePhase) return 1;
    return 0;
  });
}
