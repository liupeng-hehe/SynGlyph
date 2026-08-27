"use client";

import { useEffect, useRef } from "react";

type Props = {
  className?: string;
};

/**
 * Hero background: frosted-glass organic field in presentation palette
 * (cream #fff8e7, IKB #002fa7, ochre #d9774a). Slow CSS drift + pointer parallax.
 */
export function FluidHeroBackground({ className = "" }: Props) {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = parallaxRef.current;
    if (!node) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // target (where the cursor wants the layer to go) and current (eased)
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let raf = 0;
    let running = false;

    // max parallax shift in px (kept subtle, like the reference)
    const MAX = 18;

    const tick = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      node.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;

      if (
        Math.abs(targetX - currentX) > 0.1 ||
        Math.abs(targetY - currentY) > 0.1
      ) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const ensureRunning = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const handlePointer = (event: PointerEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      // invert so the glass drifts opposite the cursor (depth illusion)
      targetX = -nx * MAX * 2;
      targetY = -ny * MAX * 2;
      ensureRunning();
    };

    const handleLeave = () => {
      targetX = 0;
      targetY = 0;
      ensureRunning();
    };

    window.addEventListener("pointermove", handlePointer, { passive: true });
    window.addEventListener("pointerleave", handleLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerleave", handleLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`hero-glass ${className}`.trim()} aria-hidden="true">
      <div ref={parallaxRef} className="hero-glass__parallax">
        <div className="hero-glass__image" />
        <div className="hero-glass__tint" />
      </div>
      <div className="hero-glass__sheen" />
      <div className="hero-glass__veil" />
    </div>
  );
}
