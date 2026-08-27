"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms, applied to the long expo-out reveal. */
  delay?: number;
};

/**
 * One-shot scroll reveal modeled on ineo-sense.com:
 * elements start faded + shifted down, then play a long expo-out
 * transition (opacity + translateY) the first time they enter view.
 * Uses IntersectionObserver only (no scroll listeners) so it never
 * interferes with native scrolling performance.
 */
export function ViewReveal({ children, className = "", delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.classList.add("is-inview");
      return;
    }

    // Already on screen at mount (e.g. hero): reveal on next frame.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
      requestAnimationFrame(() => node.classList.add("is-inview"));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.classList.add("is-inview");
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    delay > 0 ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;

  return (
    <div
      ref={ref}
      className={`view-reveal${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </div>
  );
}
