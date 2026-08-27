"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";

type Props = {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
  priority?: boolean;
};

const TRANSITION_MS = 1200;
const TRANSITION_PEAK = 0.62;
const MOVE_INTERVAL_MS = 32;

const INTERACTIVE_DAMPING = 0.932;
const INTERACTIVE_SETTLE = 0.15;
const INTERACTIVE_RADIUS = 0.012;
const INTERACTIVE_REFRACTION = 0.048;
const RIPPLE_FORCE = 200;

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  precision highp float;

  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform sampler2D uDisp;
  uniform float uMix;
  uniform float uStrength;
  uniform sampler2D uRipple;
  uniform vec2 uRippleTexel;
  uniform float uRippleRefraction;

  varying vec2 vUv;

  void main() {
    vec2 dispUv = vUv * 1.35;
    vec4 disp = texture2D(uDisp, dispUv);
    vec2 dispVec = (disp.rg - 0.5) * 2.0;

    vec2 rippleUv = vec2(vUv.x, 1.0 - vUv.y);
    float wL = texture2D(uRipple, rippleUv - vec2(uRippleTexel.x, 0.0)).r;
    float wR = texture2D(uRipple, rippleUv + vec2(uRippleTexel.x, 0.0)).r;
    float wU = texture2D(uRipple, rippleUv + vec2(0.0, uRippleTexel.y)).r;
    float wD = texture2D(uRipple, rippleUv - vec2(0.0, uRippleTexel.y)).r;
    vec2 rippleDisp = vec2(wL - wR, wU - wD) * uRippleRefraction;

    float mixVal = clamp(uMix, 0.0, 1.0);
    vec2 offset = dispVec * uStrength + rippleDisp;
    vec2 uvA = vUv + offset * (1.0 - mixVal);
    vec2 uvB = vUv - offset * mixVal;

    vec4 colA = texture2D(uTexA, uvA);
    vec4 colB = texture2D(uTexB, uvB);
    gl_FragColor = mix(colA, colB, smoothstep(0.0, 1.0, mixVal));
  }
`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function transitionEnvelope(t: number): number {
  const peakAt = 0.22;
  if (t < peakAt) return easeOutExpo(t / peakAt) * TRANSITION_PEAK;
  return TRANSITION_PEAK * (1 - easeOutQuart((t - peakAt) / (1 - peakAt)));
}

function transitionMix(t: number): number {
  return easeInOutCubic(clamp((t - 0.04) / 0.52, 0, 1));
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 4; i++) {
    value += amp * smoothNoise(px, py);
    px *= 2.02;
    py *= 2.02;
    amp *= 0.5;
  }
  return value;
}

function createRippleTexture(w: number, h: number): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 128;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function initRippleBuffers(width: number, height: number) {
  const w = Math.max(32, Math.round(width * 0.35));
  const h = Math.max(32, Math.round(height * 0.35));
  return {
    w,
    h,
    a: new Float32Array(w * h),
    b: new Float32Array(w * h),
  };
}

function disturbInteractive(
  buffer: Float32Array,
  simW: number,
  simH: number,
  normX: number,
  normY: number,
  force: number,
) {
  const cx = normX * simW;
  const cy = normY * simH;
  const radius = Math.max(1, simW * INTERACTIVE_RADIUS);

  for (let py = 1; py < simH - 1; py++) {
    for (let px = 1; px < simW - 1; px++) {
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > radius) continue;
      buffer[py * simW + px] += force * (1 - dist / radius);
    }
  }
}

function stepRippleSimulation(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
): boolean {
  let moving = false;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const wave =
        (a[idx - 1] + a[idx + 1] + a[idx - w] + a[idx + w]) / 2 - b[idx];
      b[idx] = wave * INTERACTIVE_DAMPING;
      if (Math.abs(b[idx]) > INTERACTIVE_SETTLE) moving = true;
    }
  }
  return moving;
}

function uploadRippleTexture(
  texture: THREE.DataTexture,
  buffer: Float32Array,
) {
  const data = texture.image.data as Uint8Array;
  for (let i = 0; i < buffer.length; i++) {
    data[i * 4] = Math.min(255, Math.max(0, Math.round(128 + buffer[i] * 0.85)));
    data[i * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

function createDisplacementTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const n1 = fbm(nx * 3.2, ny * 3.2);
      const n2 = fbm(nx * 3.2 + 4.7, ny * 3.2 + 2.1);
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(n1 * 255);
      data[idx + 1] = Math.floor(n2 * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function drawImageToCanvas(
  img: HTMLImageElement,
  cw: number,
  ch: number,
  fit: "cover" | "contain",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#fff8e7";
  ctx.fillRect(0, 0, cw, ch);

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = cw / ch;
  let drawW = cw;
  let drawH = ch;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "contain") {
    if (imgRatio > boxRatio) {
      drawW = cw;
      drawH = cw / imgRatio;
      offsetY = (ch - drawH) / 2;
    } else {
      drawH = ch;
      drawW = ch * imgRatio;
      offsetX = (cw - drawW) / 2;
    }
  } else if (imgRatio > boxRatio) {
    drawH = ch;
    drawW = ch * imgRatio;
    offsetX = (cw - drawW) / 2;
  } else {
    drawW = cw;
    drawH = cw / imgRatio;
    offsetY = (ch - drawH) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  return canvas;
}

function canvasToTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.Texture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canUseWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

export function RippleImage({
  src,
  alt,
  fit = "cover",
  className = "",
  priority = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const texARef = useRef<THREE.Texture | null>(null);
  const texBRef = useRef<THREE.Texture | null>(null);
  const dispTexRef = useRef<THREE.DataTexture | null>(null);
  const rippleTexRef = useRef<THREE.DataTexture | null>(null);
  const rippleBufferARef = useRef<Float32Array | null>(null);
  const rippleBufferBRef = useRef<Float32Array | null>(null);
  const simSizeRef = useRef({ w: 0, h: 0 });
  const rippleAnimatingRef = useRef(false);
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastMoveRef = useRef(0);
  const transitionRef = useRef<{ start: number; active: boolean }>({
    start: 0,
    active: false,
  });
  const prevSrcRef = useRef<string | null>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const reduceMotionRef = useRef(false);
  const [useGl, setUseGl] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState(src);

  const disposeTexture = useCallback((tex: THREE.Texture | null) => {
    tex?.dispose();
  }, []);

  const makeTexture = useCallback(
    (img: HTMLImageElement, w: number, h: number) => {
      const canvas = drawImageToCanvas(img, w, h, fit);
      return canvasToTexture(canvas);
    },
    [fit],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    setUseGl(!mq.matches && canUseWebGL());
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
      setUseGl(!mq.matches && canUseWebGL());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!useGl) {
      setFallbackSrc(src);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    loadImage(src)
      .then(() => {
        if (!cancelled) setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setUseGl(false);
          setFallbackSrc(src);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, useGl]);

  useEffect(() => {
    if (!useGl || !loaded) return;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const dispTex = createDisplacementTexture();
    dispTexRef.current = dispTex;

    const initSim = initRippleBuffers(
      wrap.clientWidth || 640,
      wrap.clientHeight || 480,
    );
    simSizeRef.current = { w: initSim.w, h: initSim.h };
    rippleBufferARef.current = initSim.a;
    rippleBufferBRef.current = initSim.b;
    const rippleTex = createRippleTexture(initSim.w, initSim.h);
    rippleTexRef.current = rippleTex;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTexA: { value: null as THREE.Texture | null },
        uTexB: { value: null as THREE.Texture | null },
        uDisp: { value: dispTex },
        uMix: { value: 0 },
        uStrength: { value: 0 },
        uRipple: { value: rippleTex },
        uRippleTexel: {
          value: new THREE.Vector2(1 / initSim.w, 1 / initSim.h),
        },
        uRippleRefraction: { value: INTERACTIVE_REFRACTION },
      },
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      const sizeChanged = sizeRef.current.w !== w || sizeRef.current.h !== h;
      sizeRef.current = { w, h };
      renderer.setSize(w, h, false);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      if (sizeChanged) {
        const sim = initRippleBuffers(rect.width, rect.height);
        simSizeRef.current = { w: sim.w, h: sim.h };
        rippleBufferARef.current = sim.a;
        rippleBufferBRef.current = sim.b;
        rippleAnimatingRef.current = false;
        rippleTexRef.current?.dispose();
        const nextRippleTex = createRippleTexture(sim.w, sim.h);
        rippleTexRef.current = nextRippleTex;
        if (materialRef.current) {
          materialRef.current.uniforms.uRipple.value = nextRippleTex;
          materialRef.current.uniforms.uRippleTexel.value.set(1 / sim.w, 1 / sim.h);
        }
      }

      if (sizeChanged && texARef.current) {
        void loadImage(srcRef.current).then((img) => {
          const next = makeTexture(img, w, h);
          disposeTexture(texARef.current);
          texARef.current = next;
          if (materialRef.current) {
            materialRef.current.uniforms.uTexA.value = next;
            if (!transitionRef.current.active) {
              materialRef.current.uniforms.uTexB.value = next;
            }
          }
        });
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const tick = (now: number) => {
      const { w, h } = sizeRef.current;
      const mat = materialRef.current;
      if (mat && w > 0) {
        const trans = transitionRef.current;
        if (trans.active) {
          const t = clamp((now - trans.start) / TRANSITION_MS, 0, 1);
          mat.uniforms.uStrength.value = transitionEnvelope(t);
          mat.uniforms.uMix.value = transitionMix(t);
          if (t >= 1) {
            trans.active = false;
            mat.uniforms.uMix.value = 0;
            mat.uniforms.uStrength.value = 0;
            if (texARef.current) disposeTexture(texARef.current);
            texARef.current = texBRef.current;
            texBRef.current = null;
            mat.uniforms.uTexA.value = texARef.current;
            mat.uniforms.uTexB.value = texARef.current;
          }
        }

        if (rippleAnimatingRef.current) {
          const a = rippleBufferARef.current;
          const b = rippleBufferBRef.current;
          const { w: sw, h: sh } = simSizeRef.current;
          if (a && b && sw > 0) {
            rippleAnimatingRef.current = stepRippleSimulation(a, b, sw, sh);
            rippleBufferARef.current = b;
            rippleBufferBRef.current = a;
            if (rippleTexRef.current) {
              uploadRippleTexture(rippleTexRef.current, b);
            }
            if (!rippleAnimatingRef.current) {
              a.fill(0);
              b.fill(0);
              if (rippleTexRef.current) {
                uploadRippleTexture(rippleTexRef.current, b);
              }
            }
          }
        }

        renderer.render(scene, camera);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      geometry.dispose();
      material.dispose();
      dispTex.dispose();
      rippleTexRef.current?.dispose();
      disposeTexture(texARef.current);
      disposeTexture(texBRef.current);
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      materialRef.current = null;
      texARef.current = null;
      texBRef.current = null;
    };
  }, [disposeTexture, fit, loaded, makeTexture, useGl]);

  useEffect(() => {
    if (!useGl || !loaded) return;

    let cancelled = false;
    const applySrc = async () => {
      const mat = materialRef.current;
      if (!mat) return;

      try {
        const img = await loadImage(src);
        if (cancelled) return;

        const width = sizeRef.current.w || Math.round((wrapRef.current?.clientWidth || 640) * Math.min(window.devicePixelRatio || 1, 2));
        const height = sizeRef.current.h || Math.round((wrapRef.current?.clientHeight || 480) * Math.min(window.devicePixelRatio || 1, 2));
        const nextTex = makeTexture(img, width, height);

        if (prevSrcRef.current === src && texARef.current) {
          disposeTexture(nextTex);
          return;
        }

        const isFirst = !texARef.current;
        prevSrcRef.current = src;

        if (isFirst) {
          texARef.current = nextTex;
          mat.uniforms.uTexA.value = nextTex;
          mat.uniforms.uTexB.value = nextTex;
          mat.uniforms.uMix.value = 0;
          mat.uniforms.uStrength.value = 0;
          return;
        }

        if (reduceMotionRef.current) {
          disposeTexture(texARef.current);
          texARef.current = nextTex;
          mat.uniforms.uTexA.value = nextTex;
          mat.uniforms.uTexB.value = nextTex;
          mat.uniforms.uMix.value = 0;
          mat.uniforms.uStrength.value = 0;
          return;
        }

        disposeTexture(texBRef.current);
        texBRef.current = nextTex;
        mat.uniforms.uTexB.value = nextTex;
        mat.uniforms.uMix.value = 0;
        transitionRef.current = { start: performance.now(), active: true };
      } catch {
        if (!cancelled) setUseGl(false);
      }
    };

    void applySrc();

    return () => {
      cancelled = true;
    };
  }, [disposeTexture, loaded, makeTexture, src, useGl]);

  const clientToNorm = useCallback((clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  const disturbAtPointer = useCallback((normX: number, normY: number, force: number) => {
    const buffer = rippleBufferARef.current;
    const { w, h } = simSizeRef.current;
    if (!buffer || w === 0) return;
    disturbInteractive(buffer, w, h, normX, normY, force);
    rippleAnimatingRef.current = true;
  }, []);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!useGl || reduceMotionRef.current) return;
    const now = performance.now();
    if (now - lastMoveRef.current < MOVE_INTERVAL_MS) return;
    lastMoveRef.current = now;
    const norm = clientToNorm(event.clientX, event.clientY);
    if (!norm) return;
    disturbAtPointer(norm.x, norm.y, RIPPLE_FORCE);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!useGl || reduceMotionRef.current) return;
    const norm = clientToNorm(event.clientX, event.clientY);
    if (!norm) return;
    disturbAtPointer(norm.x, norm.y, RIPPLE_FORCE * 1.15);
  };

  return (
    <div
      ref={wrapRef}
      className={`ripple-image ${className}`.trim()}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
    >
      {useGl && loaded ? (
        <canvas ref={canvasRef} className="ripple-image__canvas" aria-hidden />
      ) : (
        <Image
          src={fallbackSrc}
          alt={alt}
          fill
          className={`ripple-image__fallback ripple-image__fallback--${fit}`}
          sizes="(max-width: 960px) 95vw, 640px"
          priority={priority}
          draggable={false}
        />
      )}
      <span className="sr-only">{alt}</span>
    </div>
  );
}
