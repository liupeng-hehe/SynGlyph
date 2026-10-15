"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type TransitionState = "before" | "visible" | "after";
type BridgeVariant = "dark-to-light" | "light-to-green";

type BridgeProps = {
  id?: string;
  children: ReactNode;
  ariaLabel: string;
  variant: BridgeVariant;
};

const HOLD_STEPS = 2;
const HOLD_STEP_MS = 800;
const WASH_DURATION_MS = 1400;
const COPY_SETTLE_MS = 700;

const WASH = {
  "dark-to-light": {
    fromBg: "#71557a",
    toBg: "#fffcf7",
    fromInk: "#f5f2ec",
    toInk: "#6b6560",
  },
  "light-to-green": {
    fromBg: "#fffcf7",
    toBg: "#7e8c54",
    fromInk: "#6b6560",
    toInk: "#f5f7fb",
  },
} as const;

type WashBg = (typeof WASH)[BridgeVariant]["fromBg"] | (typeof WASH)[BridgeVariant]["toBg"];
type WashInk = (typeof WASH)[BridgeVariant]["fromInk"] | (typeof WASH)[BridgeVariant]["toInk"];

export function NarrativeBridgeTransition({
  id,
  children,
  ariaLabel,
  variant,
}: BridgeProps) {
  const palette = WASH[variant];
  const sectionRef = useRef<HTMLElement>(null);
  const visibleRef = useRef(false);
  const fromBelowRef = useRef(false);
  const lastYRef = useRef(0);
  const washStartedRef = useRef(false);
  const washUntilRef = useRef(0);
  const washTimerRef = useRef(0);
  const washUnlockTimerRef = useRef(0);
  const [state, setState] = useState<TransitionState>("before");
  const [holdIndex, setHoldIndex] = useState(0);
  const [allowFade, setAllowFade] = useState(false);
  const [bg, setBg] = useState<WashBg>(palette.fromBg);
  const [ink, setInk] = useState<WashInk>(palette.fromInk);

  const consumeBridgeWheel = useCallback(() => {
    return performance.now() < washUntilRef.current;
  }, []);

  const onHoldIndexChange = useCallback((index: number) => {
    if (performance.now() < washUntilRef.current) {
      setHoldIndex(fromBelowRef.current ? HOLD_STEPS - 1 : 0);
      return;
    }
    setHoldIndex(index);
  }, []);

  useSnapSectionWheelSequence({
    rootRef: sectionRef,
    itemCount: HOLD_STEPS,
    activeIndex: holdIndex,
    onIndexChange: onHoldIndexChange,
    stepMs: HOLD_STEP_MS,
    entryLockMs: 900,
    consumeWheel: consumeBridgeWheel,
  });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const startWash = () => {
      if (washStartedRef.current) return;
      washStartedRef.current = true;
      const reverse = fromBelowRef.current;
      washUntilRef.current =
        performance.now() + COPY_SETTLE_MS + WASH_DURATION_MS + 500;
      window.clearTimeout(washTimerRef.current);
      window.clearTimeout(washUnlockTimerRef.current);
      washTimerRef.current = window.setTimeout(() => {
        setAllowFade(true);
        setBg(reverse ? palette.fromBg : palette.toBg);
        setInk(reverse ? palette.fromInk : palette.toInk);
        washUnlockTimerRef.current = window.setTimeout(() => {
          washUntilRef.current = performance.now() + 500;
          setHoldIndex(reverse ? 0 : HOLD_STEPS - 1);
        }, WASH_DURATION_MS);
      }, COPY_SETTLE_MS);
    };

    const pageIsParked = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      return visible / vh >= 0.9 && Math.abs(rect.top) < 16;
    };

    const onScrollY = () => {
      const rect = section.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        lastYRef.current = window.scrollY;
      }
      if (visibleRef.current && pageIsParked()) startWash();
    };
    lastYRef.current = window.scrollY;
    window.addEventListener("scroll", onScrollY, { passive: true });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.32) {
          if (!visibleRef.current) {
            const fromBelow = window.scrollY + 16 < lastYRef.current;
            fromBelowRef.current = fromBelow;
            visibleRef.current = true;
            setState("visible");
            setAllowFade(false);
            setHoldIndex(fromBelow ? HOLD_STEPS - 1 : 0);
            setBg(fromBelow ? palette.toBg : palette.fromBg);
            setInk(fromBelow ? palette.toInk : palette.fromInk);
          }

          const pageSettled =
            entry.intersectionRatio >= 0.9 &&
            Math.abs(entry.boundingClientRect.top) < 16;
          if (pageSettled) startWash();
          return;
        }

        if (!entry.isIntersecting || entry.intersectionRatio < 0.18) {
          visibleRef.current = false;
          washStartedRef.current = false;
          window.clearTimeout(washTimerRef.current);
          window.clearTimeout(washUnlockTimerRef.current);
          washUntilRef.current = 0;
          setAllowFade(false);
          setHoldIndex(0);
          if (entry.boundingClientRect.top < 0) {
            setState("after");
            setBg(palette.toBg);
            setInk(palette.toInk);
          } else {
            setState("before");
            setBg(palette.fromBg);
            setInk(palette.fromInk);
          }
        }
      },
      { threshold: [0, 0.18, 0.32, 0.5, 0.72, 0.9, 0.96] },
    );

    observer.observe(section);
    return () => {
      window.removeEventListener("scroll", onScrollY);
      window.clearTimeout(washTimerRef.current);
      window.clearTimeout(washUnlockTimerRef.current);
      observer.disconnect();
    };
  }, [palette]);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`personal-archive-transition personal-archive-transition--${variant}${
        allowFade ? " is-washing" : ""
      }`}
      data-snap-section
      data-wheel-sequence
      data-wheel-at={holdIndex <= 0 ? "start" : holdIndex >= HOLD_STEPS - 1 ? "end" : "mid"}
      data-transition-state={state}
      aria-label={ariaLabel}
      style={
        {
          "--bridge-bg": bg,
          "--bridge-ink": ink,
        } as CSSProperties
      }
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
