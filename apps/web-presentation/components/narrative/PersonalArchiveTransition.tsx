"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type TransitionState = "before" | "visible" | "after";

type BridgeProps = {
  children: ReactNode;
  ariaLabel: string;
  variant: "dark-to-light" | "light-to-green";
};

export function NarrativeBridgeTransition({
  children,
  ariaLabel,
  variant,
}: BridgeProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<TransitionState>("before");

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          setState("visible");
          return;
        }
        setState(entry.boundingClientRect.top < 0 ? "after" : "before");
      },
      { threshold: [0, 0.35, 0.65] },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`personal-archive-transition personal-archive-transition--${variant}`}
      data-snap-section
      data-transition-state={state}
      aria-label={ariaLabel}
    >
      <p className="personal-archive-transition__copy m-0">
        {children}
      </p>
    </section>
  );
}

export function PersonalArchiveTransition() {
  return (
    <NarrativeBridgeTransition
      variant="light-to-green"
      ariaLabel="From personal experience to other synesthetes"
    >
      Many synesthetes have found ways to express their sensory worlds through
      books, music, and painting.
    </NarrativeBridgeTransition>
  );
}
