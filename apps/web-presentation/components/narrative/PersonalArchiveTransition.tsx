"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type TransitionState = "before" | "visible" | "after";

type BridgeProps = {
  children: ReactNode;
  ariaLabel: string;
  variant: "dark-to-light" | "light-to-green";
};

const DARK_TO_LIGHT_HOLD_STEPS = 5;
const DARK_TO_LIGHT_STEP_MS = 1100;

export function NarrativeBridgeTransition({
  children,
  ariaLabel,
  variant,
}: BridgeProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<TransitionState>("before");
  const [holdIndex, setHoldIndex] = useState(0);
  const holdCount = variant === "dark-to-light" ? DARK_TO_LIGHT_HOLD_STEPS : 1;

  useSnapSectionWheelSequence({
    rootRef: sectionRef,
    itemCount: holdCount,
    activeIndex: holdIndex,
    onIndexChange: setHoldIndex,
    stepMs: variant === "dark-to-light" ? DARK_TO_LIGHT_STEP_MS : 420,
  });

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
      data-wheel-sequence
      data-wheel-at={holdIndex <= 0 ? "start" : holdIndex >= holdCount - 1 ? "end" : "mid"}
      data-transition-state={state}
      aria-label={ariaLabel}
    >
      <div className="personal-archive-transition__stage">
        <p className="personal-archive-transition__copy m-0">
          {children}
        </p>
      </div>
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
