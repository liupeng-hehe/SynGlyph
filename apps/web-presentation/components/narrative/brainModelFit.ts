import * as THREE from "three";

export type BrainFit = {
  root: THREE.Object3D;
  scale: number;
  center: THREE.Vector3;
};

const SHELL_COLOR = "#E8E2D8";
const SHELL_EMISSIVE = "#C9C2B8";

export function createBrainShellMaterial(
  opacity: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: SHELL_COLOR,
    emissive: SHELL_EMISSIVE,
    emissiveIntensity: 0.04,
    transparent: true,
    opacity: Math.min(0.55, opacity * 0.92),
    roughness: 0.82,
    metalness: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function computeBrainFit(scene: THREE.Object3D): BrainFit {
  const root = scene.clone(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.55 / maxDim;

  return { root, scale, center };
}

export function fittedBrainGroupProps(fit: BrainFit): {
  scale: number;
  position: [number, number, number];
} {
  return {
    scale: fit.scale,
    position: [
      -fit.center.x * fit.scale,
      -fit.center.y * fit.scale,
      -fit.center.z * fit.scale,
    ],
  };
}

export function surfaceNormalFromPosition(
  position: [number, number, number],
): THREE.Vector3 {
  const n = new THREE.Vector3(...position);
  return n.lengthSq() > 0.0001 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

export function normalQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return quat;
}
