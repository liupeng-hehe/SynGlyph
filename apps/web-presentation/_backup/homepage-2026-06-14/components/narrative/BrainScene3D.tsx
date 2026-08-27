"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { SafeR3FCanvas } from "@/components/three/SafeR3FCanvas";
import {
  BRAIN_GLB_PATH,
  brainRegions3D,
  type BrainRegion3DId,
} from "@/content/synesthesia3DFlows";

export type CameraPreset = "left" | "right" | "top" | "front" | "default";

export type ActiveRegionAnnotation = {
  id: BrainRegion3DId;
  index: number;
  label: string;
  color: string;
};

/** Index-based pathway colors — legend and markers must share these exactly. */
export const REGION_FLOW_COLORS = [
  "#E07A3A",
  "#D4A82E",
  "#4A9B6E",
  "#5B7FD4",
  "#9B6BB8",
  "#C97B5A",
] as const;

export function getRegionFlowColor(index: number): string {
  return REGION_FLOW_COLORS[(index - 1) % REGION_FLOW_COLORS.length];
}

const PRESET_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  default: [0, 0.15, 2.75],
  left: [-2.75, 0.1, 0.35],
  right: [2.75, 0.1, 0.35],
  top: [0, 3.1, 0.15],
  front: [0, 0.05, 2.95],
};

const SHELL_COLOR = "#E6DFD4";
const SHELL_OPACITY = 0.3;

type BrainScene3DProps = {
  activeRegions: ActiveRegionAnnotation[];
  hasGlb: boolean;
  cameraPreset: CameraPreset;
  resetToken: number;
  reducedMotion: boolean;
};

type BrainFit = {
  root: THREE.Object3D;
  scale: number;
  center: THREE.Vector3;
};

const pinTextureCache = new Map<string, THREE.CanvasTexture>();

function getPinTexture(index: number, color: string): THREE.CanvasTexture {
  const key = `${index}-${color}`;
  const cached = pinTextureCache.get(key);
  if (cached) return cached;

  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 252, 243, 0.96)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#002FA7";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index), size / 2, size / 2 + 0.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  pinTextureCache.set(key, texture);
  return texture;
}

function surfaceNormal(position: [number, number, number]): THREE.Vector3 {
  const n = new THREE.Vector3(...position);
  return n.lengthSq() > 0.0001 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

function normalQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return quat;
}

function CameraRig({
  preset,
  resetToken,
  reducedMotion,
}: {
  preset: CameraPreset;
  resetToken: number;
  reducedMotion: boolean;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const pos = PRESET_POSITIONS[preset];
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(0, 0, 0);
  }, [preset, resetToken, camera]);

  return (
    <OrbitControls
      enablePan={false}
      minDistance={1.7}
      maxDistance={4.2}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
    />
  );
}

function shellMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: SHELL_COLOR,
    emissive: "#002FA7",
    emissiveIntensity: 0.01,
    transparent: true,
    opacity: SHELL_OPACITY,
    roughness: 0.78,
    metalness: 0.01,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

function computeBrainFit(scene: THREE.Object3D): BrainFit {
  const root = scene.clone(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.55 / maxDim;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = shellMaterial();
  });

  return { root, scale, center };
}

function BrainGlbModel() {
  const { scene } = useGLTF(BRAIN_GLB_PATH);
  const fit = useMemo(() => computeBrainFit(scene), [scene]);

  return (
    <group
      scale={fit.scale}
      position={[
        -fit.center.x * fit.scale,
        -fit.center.y * fit.scale,
        -fit.center.z * fit.scale,
      ]}
    >
      <primitive object={fit.root} />
    </group>
  );
}

function AnatomicalShellPreview() {
  return (
    <group>
      <mesh scale={[1.08, 0.82, 1.32]} position={[0.04, 0, -0.04]}>
        <sphereGeometry args={[0.74, 32, 32]} />
        <meshStandardMaterial
          color={SHELL_COLOR}
          emissive="#002FA7"
          emissiveIntensity={0.012}
          transparent
          opacity={SHELL_OPACITY}
          roughness={0.8}
          metalness={0.01}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function RegionSurfaceHighlight({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const { worldPos, quat } = useMemo(() => {
    const normal = surfaceNormal(position);
    const anchor = new THREE.Vector3(...position);
    anchor.add(normal.multiplyScalar(0.005));
    return { worldPos: anchor, quat: normalQuaternion(normal) };
  }, [position]);

  return (
    <group position={worldPos} quaternion={quat}>
      <mesh scale={[0.082, 0.082, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh scale={[0.048, 0.048, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.34}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function RegionPin({
  position,
  index,
  color,
}: {
  position: [number, number, number];
  index: number;
  color: string;
}) {
  const anchor = useMemo(() => new THREE.Vector3(...position), [position]);
  const normal = useMemo(() => surfaceNormal(position), [position]);
  const pinPos = useMemo(
    () => anchor.clone().add(normal.clone().multiplyScalar(0.022)),
    [anchor, normal],
  );
  const texture = useMemo(() => getPinTexture(index, color), [index, color]);

  return (
    <group position={pinPos}>
      <sprite scale={[0.028, 0.028, 1]}>
        <spriteMaterial
          map={texture}
          transparent
          depthTest
          depthWrite={false}
          sizeAttenuation
        />
      </sprite>
    </group>
  );
}

function SignalPathway({
  activeRegions,
  reducedMotion,
}: {
  activeRegions: ActiveRegionAnnotation[];
  reducedMotion: boolean;
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const { curve, points } = useMemo(() => {
    if (activeRegions.length < 2) {
      return { curve: null, points: null };
    }
    const pts = activeRegions.map((r) => {
      const [x, y, z] = brainRegions3D[r.id].displayPosition;
      return new THREE.Vector3(x, y, z);
    });
    const pathCurve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.38);
    return { curve: pathCurve, points: pathCurve.getPoints(72) };
  }, [activeRegions]);

  useFrame((state) => {
    if (!curve || !pulseRef.current) return;
    const t = reducedMotion
      ? 0.5
      : (state.clock.elapsedTime * 0.18) % 1;
    const pos = curve.getPointAt(t);
    pulseRef.current.position.copy(pos);
    if (glowRef.current) {
      glowRef.current.position.copy(pos);
      const pulse = reducedMotion
        ? 1
        : 1 + Math.sin(state.clock.elapsedTime * 3.5) * 0.12;
      glowRef.current.scale.setScalar(0.009 * pulse);
    }
  });

  if (!points || !curve) return null;

  return (
    <group>
      <Line
        points={points}
        color="#002FA7"
        lineWidth={0.6}
        transparent
        opacity={0.1}
      />
      <Line
        points={points}
        color="#D4A82E"
        lineWidth={1}
        transparent
        opacity={0.28}
        dashed
        dashSize={0.03}
        gapSize={0.025}
      />
      <mesh ref={glowRef} scale={0.009}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#FFD447"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={pulseRef} scale={0.005}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial color="#002FA7" />
      </mesh>
    </group>
  );
}

function SceneContent({
  activeRegions,
  hasGlb,
  cameraPreset,
  resetToken,
  reducedMotion,
}: BrainScene3DProps) {
  return (
    <>
      <ambientLight intensity={0.58} color="#FFF8E7" />
      <hemisphereLight
        args={["#FFFCF3", "#D8D0C4", 0.34]}
        position={[0, 1, 0]}
      />
      <directionalLight
        position={[2.5, 1.8, 3]}
        intensity={0.42}
        color="#FFF8E7"
      />
      <directionalLight
        position={[-2.2, 0.4, -2.5]}
        intensity={0.18}
        color="#B7C7FF"
      />

      <CameraRig
        preset={cameraPreset}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />

      {hasGlb ? <BrainGlbModel /> : <AnatomicalShellPreview />}

      {activeRegions.map(({ id, index, color }) => {
        const position = brainRegions3D[id].displayPosition;
        return (
          <group key={id}>
            <RegionSurfaceHighlight position={position} color={color} />
            <RegionPin position={position} index={index} color={color} />
          </group>
        );
      })}

      <SignalPathway
        activeRegions={activeRegions}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

export function BrainScene3D(props: BrainScene3DProps) {
  return (
    <SafeR3FCanvas
      className="neuro-canvas"
      camera={{ position: PRESET_POSITIONS.default, fov: 40, near: 0.1, far: 20 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <SceneContent {...props} />
    </SafeR3FCanvas>
  );
}

useGLTF.preload(BRAIN_GLB_PATH);

export function useBrainGlbAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(BRAIN_GLB_PATH, { method: "HEAD" })
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
