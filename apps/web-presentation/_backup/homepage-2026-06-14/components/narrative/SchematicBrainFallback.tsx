"use client";

import { useMemo } from "react";
import * as THREE from "three";

import {
  brainRegions3D,
  type BrainRegion3DId,
} from "@/content/synesthesia3DFlows";
import { getPathwayActivationIntensities } from "./brainAtlasUtils";
import { getRegionFlowColor } from "./BrainScene3D";

const SHELL_COLOR = "#E8E2D8";

type SchematicBrainFallbackProps = {
  activeRegionIds: BrainRegion3DId[];
  shellOpacity: number;
  animPhase: number;
  reducedMotion: boolean;
};

export function SchematicBrainFallback({
  activeRegionIds,
  shellOpacity,
  animPhase,
  reducedMotion,
}: SchematicBrainFallbackProps) {
  const intensities = useMemo(
    () =>
      getPathwayActivationIntensities(
        activeRegionIds.length,
        animPhase,
        reducedMotion,
      ),
    [activeRegionIds.length, animPhase, reducedMotion],
  );

  return (
    <group>
      <mesh scale={[1.05, 0.92, 1.18]}>
        <sphereGeometry args={[0.9, 48, 48]} />
        <meshStandardMaterial
          color={SHELL_COLOR}
          transparent
          opacity={Math.min(0.4, shellOpacity * 0.85)}
          roughness={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {activeRegionIds.map((id, index) => {
        const intensity = intensities[index] ?? 0;
        if (intensity <= 0) return null;
        const color = getRegionFlowColor(index + 1);
        const region = brainRegions3D[id];
        return (
          <mesh
            key={id}
            position={region.displayPosition}
            scale={0.12 + intensity * 0.04}
          >
            <sphereGeometry args={[1, 24, 24]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.15 + intensity * 0.35}
              transparent
              opacity={0.45 + intensity * 0.4}
              roughness={0.7}
            />
          </mesh>
        );
      })}
    </group>
  );
}
