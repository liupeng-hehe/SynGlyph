"use client";

import { CameraControls } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";

import { SafeR3FCanvas } from "@/components/three/SafeR3FCanvas";
import type { LetterSequencePrediction } from "@/lib/letterSequenceModel";

import { SuspendedTypographicInstallation } from "./SuspendedTypographicInstallation";
import { VIEWPOINT_PRESETS } from "./viewpointPresets";

type Props = {
  prediction: LetterSequencePrediction | null;
  reveal01: number;
  fallbackWord: string;
  debug: boolean;
  viewIndex: number;
};

/**
 * Full-bleed WebGL: dominant sculptural installation + orbit (drag).
 */
export function InstallationCanvas({
  prediction,
  reveal01,
  fallbackWord,
  debug,
  viewIndex,
}: Props) {
  const controlsRef = useRef<CameraControls>(null);
  const presetIndex = debug ? viewIndex : 0;

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const p = VIEWPOINT_PRESETS[presetIndex] ?? VIEWPOINT_PRESETS[0];
    void ctrl.setLookAt(
      p.position[0],
      p.position[1],
      p.position[2],
      p.target[0],
      p.target[1],
      p.target[2],
      true,
    );
  }, [presetIndex]);

  return (
    <div className="relative w-full pt-[2vh]">
      {/*
        R3F Canvas measures its parent; `min-height` alone often yields ~0px height → thin strip.
        Use an explicit block height so WebGL fills the hero.
      */}
      <div className="relative h-[min(88vh,1080px)] min-h-[72vh] w-full sm:min-h-[76vh]">
        <SafeR3FCanvas
          className="!h-full !w-full touch-none"
          style={{ display: "block", width: "100%", height: "100%" }}
          camera={{ position: VIEWPOINT_PRESETS[0].position, fov: 48 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
        <color attach="background" args={["#f4f1ea"]} />
        <fog attach="fog" args={["#f4f1ea", 14, 62]} />
        <Suspense fallback={null}>
          <CameraControls
            ref={controlsRef}
            makeDefault
            minPolarAngle={0.22}
            maxPolarAngle={Math.PI / 2.005}
            minAzimuthAngle={-Math.PI / 2.2}
            maxAzimuthAngle={Math.PI / 2.2}
            dollySpeed={0.32}
          />
          <SuspendedTypographicInstallation
            prediction={prediction}
            reveal01={reveal01}
            fallbackWord={fallbackWord}
          />
        </Suspense>
        </SafeR3FCanvas>
      </div>
    </div>
  );
}
