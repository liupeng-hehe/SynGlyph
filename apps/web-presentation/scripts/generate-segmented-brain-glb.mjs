/**
 * Generates an educational segmented_brain.glb with named region meshes.
 * Not anatomical scan data — schematic ellipsoids for atlas highlighting.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onerror = null;
    }

    readAsArrayBuffer(blob) {
      Promise.resolve()
        .then(async () => {
          if (typeof blob.arrayBuffer === "function") {
            return blob.arrayBuffer();
          }
          if (blob instanceof ArrayBuffer) return blob;
          if (ArrayBuffer.isView(blob)) {
            return blob.buffer.slice(
              blob.byteOffset,
              blob.byteOffset + blob.byteLength,
            );
          }
          return blob;
        })
        .then((buffer) => {
          this.result = buffer;
          this.onload?.({ target: this });
        })
        .catch((error) => {
          this.onerror?.(error);
        });
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../public/neuro/segmented_brain.glb");

/** Mirrors displayPosition in content/synesthesia3DFlows.ts */
const REGIONS = {
  visualCortexOccipital: { pos: [0.55, -0.05, -0.15], radius: 0.22 },
  ventralOccipitoTemporal: { pos: [0.26, -0.36, -0.18], radius: 0.16 },
  colorV4V8: { pos: [0.48, -0.3, -0.2], radius: 0.14 },
  auditorySuperiorTemporal: { pos: [-0.08, -0.34, -0.03], radius: 0.18 },
  posteriorParietal: { pos: [0.1, 0.3, 0.06], radius: 0.2 },
  spatialParietal: { pos: [0.22, 0.24, 0.14], radius: 0.16 },
  semanticTemporal: { pos: [-0.3, -0.2, -0.04], radius: 0.19 },
  anteriorInsulaGustatory: { pos: [-0.03, -0.1, -0.04], radius: 0.12 },
  somatosensoryS1S2: { pos: [0.02, 0.34, 0.18], radius: 0.18 },
  mirrorTouchPremotorInsula: { pos: [-0.2, 0.1, 0.2], radius: 0.15 },
  frontalAttention: { pos: [-0.48, 0.17, 0.17], radius: 0.17 },
  motorBodyMapping: { pos: [-0.08, 0.42, 0.2], radius: 0.16 },
  thalamus: { pos: [0.02, -0.05, -0.04], radius: 0.09 },
};

const scene = new THREE.Scene();
scene.name = "SegmentedBrain";

const shell = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 48, 48),
  new THREE.MeshStandardMaterial({
    color: "#E8E2D8",
    transparent: true,
    opacity: 0.35,
    roughness: 0.85,
  }),
);
shell.name = "cortexShell";
shell.scale.set(1.05, 0.92, 1.18);
scene.add(shell);

const regionMaterial = new THREE.MeshStandardMaterial({
  color: "#E8E2D8",
  roughness: 0.75,
});

for (const [id, { pos, radius }] of Object.entries(REGIONS)) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 28, 28),
    regionMaterial.clone(),
  );
  mesh.name = id;
  mesh.position.set(pos[0], pos[1], pos[2]);
  scene.add(mesh);
}

async function main() {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, Buffer.from(result));
  console.log(`Wrote ${OUT_PATH} (${fs.statSync(OUT_PATH).size} bytes)`);
}

main().catch((error) => {
  console.error("GLTF export failed:", error);
  process.exit(1);
});
