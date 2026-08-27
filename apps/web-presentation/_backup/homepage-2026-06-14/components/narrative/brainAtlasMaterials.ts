import { type RefObject, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { BrainRegion3DId } from "@/content/synesthesia3DFlows";
import {
  getPathwayActivationIntensities,
  resolveRegionForMeshName,
} from "./brainAtlasUtils";
import { getRegionFlowColor } from "./BrainScene3D";

const SHELL_COLOR = "#E8E2D8";
const SHELL_EMISSIVE = "#C9C2B8";

type UseBrainAtlasMaterialsOptions = {
  rootRef: RefObject<THREE.Object3D | null>;
  activeRegionIds: BrainRegion3DId[];
  shellOpacity: number;
  animPhase: number;
  reducedMotion: boolean;
};

function getOrCreateMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const existing = mesh.userData.atlasMaterial as
    | THREE.MeshStandardMaterial
    | undefined;
  if (existing) return existing;
  const mat = new THREE.MeshStandardMaterial({
    color: SHELL_COLOR,
    emissive: SHELL_EMISSIVE,
    emissiveIntensity: 0.03,
    transparent: true,
    opacity: 0.35,
    roughness: 0.72,
    metalness: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mesh.userData.atlasMaterial = mat;
  mesh.material = mat;
  return mat;
}

export function useBrainAtlasMaterials({
  rootRef,
  activeRegionIds,
  shellOpacity,
  animPhase,
  reducedMotion,
}: UseBrainAtlasMaterialsOptions) {
  const intensitiesByRegion = useMemo(() => {
    const values = getPathwayActivationIntensities(
      activeRegionIds.length,
      animPhase,
      reducedMotion,
    );
    const map = new Map<BrainRegion3DId, number>();
    activeRegionIds.forEach((id, i) => map.set(id, values[i] ?? 0));
    return map;
  }, [activeRegionIds, animPhase, reducedMotion]);

  const colorByRegion = useMemo(() => {
    const map = new Map<BrainRegion3DId, string>();
    activeRegionIds.forEach((id, i) => {
      map.set(id, getRegionFlowColor(i + 1));
    });
    return map;
  }, [activeRegionIds]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const name = obj.name || obj.parent?.name || "";
      const regionId = resolveRegionForMeshName(name);
      const intensity =
        regionId && intensitiesByRegion.has(regionId)
          ? intensitiesByRegion.get(regionId)!
          : 0;
      const isActive = intensity > 0 && regionId !== null;
      const regionColor =
        regionId && colorByRegion.get(regionId)
          ? colorByRegion.get(regionId)!
          : SHELL_COLOR;

      const mat = getOrCreateMaterial(obj);
      mat.color.set(isActive ? regionColor : SHELL_COLOR);
      mat.emissive.set(isActive ? regionColor : SHELL_EMISSIVE);
      mat.emissiveIntensity = isActive ? 0.12 + intensity * 0.38 : 0.03;
      mat.opacity = isActive
        ? 0.55 + intensity * 0.4
        : Math.max(0.12, shellOpacity * 0.55);
      mat.depthWrite = isActive;
    });
  });
}
