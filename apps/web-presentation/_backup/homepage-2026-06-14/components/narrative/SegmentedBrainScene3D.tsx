"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { SafeR3FCanvas } from "@/components/three/SafeR3FCanvas";
import {
  BRAIN_GLB_PATH,
  SEGMENTED_BRAIN_GLB_PATH,
  type BrainRegion3DId,
} from "@/content/synesthesia3DFlows";
import { useBrainAtlasMaterials } from "./brainAtlasMaterials";
import {
  computeBrainFit,
  createBrainShellMaterial,
  fittedBrainGroupProps,
} from "./brainModelFit";
import { FittedBrainAtlas } from "./FittedBrainAtlas";
import { SchematicBrainFallback } from "./SchematicBrainFallback";
import { type CameraPreset } from "./BrainScene3D";

const PRESET_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  default: [0, 0.15, 2.75],
  left: [-2.75, 0.1, 0.35],
  right: [2.75, 0.1, 0.35],
  top: [0, 3.1, 0.15],
  front: [0, 0.05, 2.95],
};

type SegmentedBrainScene3DProps = {
  activeRegionIds: BrainRegion3DId[];
  hasSegmentedModel: boolean;
  hasSurfaceShell: boolean;
  shellOpacity: number;
  cameraPreset: CameraPreset;
  resetToken: number;
  reducedMotion: boolean;
  animPhase: number;
};

function CameraRig({
  preset,
  resetToken,
}: {
  preset: CameraPreset;
  resetToken: number;
}) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0.05, 0), []);

  useEffect(() => {
    const pos = PRESET_POSITIONS[preset];
    camera.position.set(...pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [preset, resetToken, camera, target]);

  return null;
}

function GlbSegmentedBrain({
  activeRegionIds,
  shellOpacity,
  animPhase,
  reducedMotion,
}: {
  activeRegionIds: BrainRegion3DId[];
  shellOpacity: number;
  animPhase: number;
  reducedMotion: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(SEGMENTED_BRAIN_GLB_PATH, true);
  const fit = useMemo(() => computeBrainFit(scene), [scene]);
  const groupProps = useMemo(() => fittedBrainGroupProps(fit), [fit]);
  const cloned = useMemo(() => fit.root, [fit]);

  useBrainAtlasMaterials({
    rootRef,
    activeRegionIds,
    shellOpacity,
    animPhase,
    reducedMotion,
  });

  useEffect(() => {
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.userData.atlasMaterial) {
        obj.material = createBrainShellMaterial(shellOpacity);
      }
    });
  }, [cloned, shellOpacity]);

  return (
    <group ref={rootRef} {...groupProps}>
      <primitive object={cloned} />
    </group>
  );
}

function SceneContent({
  activeRegionIds,
  hasSegmentedModel,
  hasSurfaceShell,
  shellOpacity,
  cameraPreset,
  resetToken,
  reducedMotion,
  animPhase,
}: SegmentedBrainScene3DProps) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[2.5, 3, 2]} intensity={0.55} />
      <directionalLight position={[-2, 1.5, -1]} intensity={0.28} />
      <CameraRig preset={cameraPreset} resetToken={resetToken} />
      {hasSegmentedModel ? (
        <GlbSegmentedBrain
          activeRegionIds={activeRegionIds}
          shellOpacity={shellOpacity}
          animPhase={animPhase}
          reducedMotion={reducedMotion}
        />
      ) : hasSurfaceShell ? (
        <FittedBrainAtlas
          activeRegionIds={activeRegionIds}
          shellOpacity={shellOpacity}
          animPhase={animPhase}
          reducedMotion={reducedMotion}
        />
      ) : (
        <SchematicBrainFallback
          activeRegionIds={activeRegionIds}
          shellOpacity={shellOpacity}
          animPhase={animPhase}
          reducedMotion={reducedMotion}
        />
      )}
      <OrbitControls
        enablePan={false}
        minDistance={1.85}
        maxDistance={4.2}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

export function SegmentedBrainScene3D(props: SegmentedBrainScene3DProps) {
  return (
    <SafeR3FCanvas
      className="synesthesia-brain-atlas__canvas"
      camera={{ position: PRESET_POSITIONS.default, fov: 42, near: 0.1, far: 20 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.75]}
    >
      <SceneContent {...props} />
    </SafeR3FCanvas>
  );
}

useGLTF.preload(BRAIN_GLB_PATH);

export function useSegmentedBrainAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(SEGMENTED_BRAIN_GLB_PATH, { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setAvailable(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
