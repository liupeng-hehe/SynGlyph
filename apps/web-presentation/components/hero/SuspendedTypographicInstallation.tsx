"use client";

import { Text3D } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { labToSrgb } from "@/lib/labToSrgb";
import type { LetterSequencePrediction } from "@/lib/letterSequenceModel";

const FONT_URL = "/fonts/helvetiker_regular.typeface.json";

type Props = {
  prediction: LetterSequencePrediction | null;
  reveal01: number;
  fallbackWord: string;
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * One suspended sculptural mass: stroke-derived extrusions in a tight overlapping cluster
 * (not a legible word row). Color fields read first; letter identity resolves late.
 */
export function SuspendedTypographicInstallation({
  prediction,
  reveal01,
  fallbackWord,
}: Props) {
  const word = prediction?.word_text?.length ? prediction.word_text : fallbackWord;
  const visible = [...word]
    .map((ch) => ({ ch }))
    .filter((x) => x.ch !== " " && x.ch !== "\n");
  const nModel = prediction?.pred_lab?.length ?? 0;

  const rootRef = useRef<THREE.Group>(null);
  const { gl, clock } = useThree();
  const draggingRef = useRef(false);

  const colorPhase = smoothstep(0, 0.42, reveal01);
  const formPhase = smoothstep(0.52, 0.98, reveal01);

  const colors = useMemo(() => {
    return visible.map((_, vi) => {
      if (prediction && vi < nModel) {
        const [L, a, b] = prediction.pred_lab[vi];
        const [r, g, bl] = labToSrgb(L, a, b);
        return new THREE.Color(r, g, bl);
      }
      const t = (vi * 0.13) % 1;
      return new THREE.Color().setHSL(0.58 + t * 0.08, 0.18, 0.55);
    });
  }, [visible, prediction, nModel]);

  /** Overlapping 3D cluster — reads as one object until formPhase separates. */
  const layout = useMemo(() => {
    const n = Math.max(visible.length, 1);
    return visible.map((_, vi) => {
      const golden = vi * 2.399963229728653;
      const t = n > 1 ? vi / (n - 1) : 0.5;
      const shell = 1.15 + (vi % 5) * 0.18;
      const x = Math.cos(golden) * shell * 0.92 + Math.sin(vi * 0.7) * 0.25;
      const z = Math.sin(golden) * shell * 0.78 - 0.35;
      const y = (t - 0.5) * 1.65 + Math.cos(vi * 1.1) * 0.28;
      const rotX = 0.35 + vi * 0.31 + Math.sin(vi) * 0.2;
      const rotY = golden * 0.45 + (t - 0.5) * 0.6;
      const rotZ = (t - 0.5) * 1.1 + vi * 0.09;
      return { x, y, z, rotX, rotY, rotZ };
    });
  }, [visible]);

  useFrame((_, delta) => {
    const g = rootRef.current;
    if (!g) return;
    const slow = draggingRef.current ? 0.1 : 0.42;
    g.rotation.y += delta * slow * 0.022;
    g.rotation.x = Math.sin(clock.elapsedTime * 0.28) * 0.035;
    g.rotation.z = Math.cos(clock.elapsedTime * 0.19) * 0.018;
  });

  useEffect(() => {
    const el = gl.domElement;
    const down = () => {
      draggingRef.current = true;
    };
    const up = () => {
      draggingRef.current = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  /** ~4× previous scale so the mass reads as the hero object, not a wordmark. */
  const INSTALL_SCALE = 8.6;
  const GLYPH_SIZE = 2.05;
  const EXTRUDE = 0.34;

  return (
    <group ref={rootRef} position={[0, -0.42, 0]} scale={INSTALL_SCALE}>
      <ambientLight intensity={0.42} />
      <directionalLight position={[8, 12, 6]} intensity={0.78} />
      <directionalLight position={[-6, 3, -8]} intensity={0.32} color="#e8e4dc" />
      <pointLight position={[0, 2, 3]} intensity={0.35} distance={14} decay={2} />

      {visible.map(({ ch }, vi) => {
        const pos = layout[vi];
        const c = colors[vi] ?? new THREE.Color(0.45, 0.45, 0.46);
        const baseDark = new THREE.Color(0.05, 0.05, 0.06);
        const emissiveIntensity = 0.35 + 1.05 * colorPhase;
        const opacity = 0.06 + 0.11 * colorPhase + 0.78 * formPhase * formPhase;

        return (
          <group
            key={`${vi}-${ch}`}
            position={[pos.x, pos.y, pos.z]}
            rotation={[pos.rotX, pos.rotY, pos.rotZ]}
          >
            <Text3D
              font={FONT_URL}
              size={GLYPH_SIZE}
              height={EXTRUDE}
              curveSegments={12}
              bevelEnabled
              bevelThickness={0.045}
              bevelSize={0.028}
              bevelSegments={4}
              letterSpacing={0.008}
            >
              {ch}
              <meshStandardMaterial
                color={baseDark}
                emissive={c}
                emissiveIntensity={emissiveIntensity}
                transparent
                opacity={opacity}
                roughness={0.58}
                metalness={0.14}
              />
            </Text3D>
          </group>
        );
      })}
    </group>
  );
}
