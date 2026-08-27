"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import {
  BRAIN_GLB_PATH,
  brainRegions3D,
  type BrainRegion3DId,
} from "@/content/synesthesia3DFlows";
import { getPathwayActivationIntensities } from "./brainAtlasUtils";
import {
  computeBrainFit,
  createBrainShellMaterial,
  fittedBrainGroupProps,
  normalQuaternion,
  surfaceNormalFromPosition,
} from "./brainModelFit";
import { getRegionFlowColor } from "./BrainScene3D";

const PATCH_SCALE: Partial<Record<BrainRegion3DId, number>> = {
  visualCortexOccipital: 1.15,
  ventralOccipitoTemporal: 0.95,
  colorV4V8: 0.85,
  auditorySuperiorTemporal: 1,
  posteriorParietal: 1.1,
  spatialParietal: 0.95,
  semanticTemporal: 1.05,
  anteriorInsulaGustatory: 0.75,
  somatosensoryS1S2: 1.05,
  mirrorTouchPremotorInsula: 0.9,
  frontalAttention: 0.95,
  motorBodyMapping: 1,
  thalamus: 0.55,
};

function RegionSurfacePatch({
  position,
  color,
  intensity,
  regionScale = 1,
}: {
  position: [number, number, number];
  color: string;
  intensity: number;
  regionScale?: number;
}) {
  const { anchor, quat, outer, mid, inner } = useMemo(() => {
    const normal = surfaceNormalFromPosition(position);
    const anchorVec = new THREE.Vector3(...position);
    anchorVec.add(normal.clone().multiplyScalar(0.012));
    const s = regionScale;
    return {
      anchor: anchorVec,
      quat: normalQuaternion(normal),
      outer: 0.13 * s,
      mid: 0.09 * s,
      inner: 0.055 * s,
    };
  }, [position, regionScale]);

  if (intensity <= 0) return null;

  const outerOpacity = 0.1 + intensity * 0.22;
  const midOpacity = 0.22 + intensity * 0.38;
  const innerOpacity = 0.38 + intensity * 0.45;

  return (
    <group position={anchor} quaternion={quat}>
      <mesh scale={[outer, outer, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={outerOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh scale={[mid, mid, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={midOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh scale={[inner, inner, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={innerOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

type FittedBrainAtlasProps = {
  activeRegionIds: BrainRegion3DId[];
  shellOpacity: number;
  animPhase: number;
  reducedMotion: boolean;
};

export function FittedBrainAtlas({
  activeRegionIds,
  shellOpacity,
  animPhase,
  reducedMotion,
}: FittedBrainAtlasProps) {
  const { scene } = useGLTF(BRAIN_GLB_PATH, true);
  const fit = useMemo(() => computeBrainFit(scene), [scene]);
  const groupProps = useMemo(() => fittedBrainGroupProps(fit), [fit]);

  const intensities = useMemo(
    () =>
      getPathwayActivationIntensities(
        activeRegionIds.length,
        animPhase,
        reducedMotion,
      ),
    [activeRegionIds.length, animPhase, reducedMotion],
  );

  useEffect(() => {
    fit.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = createBrainShellMaterial(shellOpacity);
    });
  }, [fit.root, shellOpacity]);

  return (
    <group {...groupProps}>
      <primitive object={fit.root} />
      {activeRegionIds.map((id, index) => (
        <RegionSurfacePatch
          key={id}
          position={brainRegions3D[id].displayPosition}
          color={getRegionFlowColor(index + 1)}
          intensity={intensities[index] ?? 0}
          regionScale={PATCH_SCALE[id] ?? 1}
        />
      ))}
    </group>
  );
}
