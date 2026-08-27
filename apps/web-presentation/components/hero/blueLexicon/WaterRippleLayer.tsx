"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { blueLexiconHeroConfig } from "./blueLexiconHeroConfig";
import styles from "./blueLexicon.module.css";

type Ripple = { id: number; x: number; y: number };

type WaterRippleLayerProps = {
  sectionRef: RefObject<HTMLElement | null>;
};

export function WaterRippleLayer({ sectionRef }: WaterRippleLayerProps) {
  const cfg = blueLexiconHeroConfig.ripples;
  const wlPct = blueLexiconHeroConfig.layout.waterlineYPercent;
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const spawn = useCallback(
    (x: number, y: number) => {
      if (!cfg.enabled || reduceMotionRef.current) return;
      const now = performance.now();
      if (now - lastSpawnRef.current < cfg.spawnIntervalMs) return;
      lastSpawnRef.current = now;

      const id = ++idRef.current;
      setRipples((prev) => {
        const next = [...prev, { id, x, y }];
        const overflow = next.length - cfg.maxConcurrent;
        if (overflow > 0) next.splice(0, overflow);
        return next;
      });

      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, cfg.durationMs + 50);
    },
    [cfg],
  );

  useEffect(() => {
    if (!cfg.enabled) return;

    const onMove = (e: PointerEvent) => {
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const wlPx = (wlPct / 100) * rect.height;

      if (y < wlPx) return;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;

      const relX = x;
      const relY = y - wlPx;
      spawn(relX, relY);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [cfg.enabled, sectionRef, spawn, wlPct]);

  const layerStyle: CSSProperties = {
    top: "var(--wl-pct)",
    "--ripple-end": `${cfg.endDiameterPx}px`,
    "--ripple-dur": `${cfg.durationMs}ms`,
    "--ripple-opacity-peak": String(cfg.opacityPeak),
    "--ripple-stroke": `${cfg.strokeWidthPx}px`,
    "--ripple-color": cfg.color,
    "--ripple-scale-start": String(cfg.startDiameterPx / cfg.endDiameterPx),
  } as CSSProperties;

  if (!cfg.enabled) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[8]"
      style={layerStyle}
      role="presentation"
      aria-hidden
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className={styles.waterRippleRing}
          style={{ left: r.x, top: r.y }}
        />
      ))}
    </div>
  );
}
