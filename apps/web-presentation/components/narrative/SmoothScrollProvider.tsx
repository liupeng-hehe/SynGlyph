"use client";

import "lenis/dist/lenis.css";
import Lenis from "lenis";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import { pickDominantSnapSection } from "./sectionScrollUtils";

type ScrollApi = {
  scrollTo: (target: string | HTMLElement, options?: { offset?: number; duration?: number }) => void;
  scrollToOffset: (top: number, options?: { immediate?: boolean; duration?: number }) => void;
  subscribeScroll: (callback: () => void) => () => void;
  isProgrammatic: () => boolean;
};

function pageTop(el: HTMLElement, offset = 0) {
  return window.scrollY + el.getBoundingClientRect().top + offset;
}

const ScrollContext = createContext<ScrollApi | null>(null);

export function useSmoothScroll() {
  return useContext(ScrollContext);
}

type Props = {
  children: ReactNode;
};

const DEFAULT_LERP = 0.09;
const GALLERY_LERP = 0.12;
const DEFAULT_WHEEL = 0.9;
const GALLERY_WHEEL = 1.15;

/** Pause snap only while mid-scroll inside a long gallery track. */
function isScrollGalleryActive(): boolean {
  return [...document.querySelectorAll<HTMLElement>("[data-scroll-gallery-track]")].some(
    (track) => {
      const rect = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= viewport) return false;

      if (track.hasAttribute("data-gallery-complete")) return false;

      const scrolledInto = rect.top <= viewport * 0.12;
      const notFinished = rect.bottom >= viewport * 0.88;
      return scrolledInto && notFinished;
    },
  );
}

function isNowMineHolding(): boolean {
  const mine = document.getElementById("personal-transition");
  if (!mine) return false;
  const vh = window.innerHeight;
  const rect = mine.getBoundingClientRect();
  const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  return vh > 0 && visible >= vh * 0.5;
}

function shouldPauseSnap(): boolean {
  return isScrollGalleryActive() || isNowMineHolding();
}

export function SmoothScrollProvider({ children }: Props) {
  const lenisRef = useRef<Lenis | null>(null);
  const snapLockRef = useRef(false);
  const programmaticRef = useRef(false);
  const unlockTimerRef = useRef(0);
  const scrollSubscribersRef = useRef(new Set<() => void>());
  const galleryModeRef = useRef(false);

  const restoreWheel = useCallback(() => {
    if (!lenisRef.current) return;
    lenisRef.current.options.wheelMultiplier = galleryModeRef.current
      ? GALLERY_WHEEL
      : DEFAULT_WHEEL;
  }, []);

  const beginProgrammatic = useCallback(() => {
    programmaticRef.current = true;
    snapLockRef.current = true;
    window.clearTimeout(unlockTimerRef.current);
  }, []);

  const endProgrammatic = useCallback(() => {
    window.clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false;
      snapLockRef.current = false;
      restoreWheel();
    }, 480);
  }, [restoreWheel]);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: DEFAULT_LERP,
      smoothWheel: true,
      wheelMultiplier: DEFAULT_WHEEL,
    });
    lenisRef.current = lenis;

    document.documentElement.classList.add("lenis", "lenis-smooth");

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    let snapTimer = 0;
    const snapToNearest = () => {
      if (snapLockRef.current || programmaticRef.current) return;
      if (shouldPauseSnap()) return;

      const target = pickDominantSnapSection();
      if (!target) return;

      const top = target.getBoundingClientRect().top;
      if (Math.abs(top) < 4) return;

      snapLockRef.current = true;
      lenis.scrollTo(pageTop(target), {
        duration: 1.05,
        onComplete: () => {
          snapLockRef.current = false;
        },
      });
    };

    const onScroll = () => {
      const insideGallery = isScrollGalleryActive();
      if (insideGallery !== galleryModeRef.current) {
        galleryModeRef.current = insideGallery;
        lenis.options.lerp = insideGallery ? GALLERY_LERP : DEFAULT_LERP;
        if (!programmaticRef.current) {
          lenis.options.wheelMultiplier = insideGallery
            ? GALLERY_WHEEL
            : DEFAULT_WHEEL;
        }
      }

      scrollSubscribersRef.current.forEach((callback) => callback());

      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(snapToNearest, insideGallery ? 320 : 140);
    };

    lenis.on("scroll", onScroll);

    return () => {
      window.clearTimeout(snapTimer);
      window.clearTimeout(unlockTimerRef.current);
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  const subscribeScroll = useCallback((callback: () => void) => {
    scrollSubscribersRef.current.add(callback);
    return () => {
      scrollSubscribersRef.current.delete(callback);
    };
  }, []);

  const scrollTo = useCallback(
    (target: string | HTMLElement, options?: { offset?: number; duration?: number }) => {
      const el =
        typeof target === "string"
          ? document.getElementById(target.replace(/^#/, ""))
          : target;

      if (!el) return;

      beginProgrammatic();
      const top = pageTop(el, options?.offset ?? 0);
      const distance = Math.abs(top - window.scrollY);
      const duration =
        options?.duration ?? Math.min(1.8, Math.max(0.85, distance / 2600));

      if (lenisRef.current) {
        lenisRef.current.options.wheelMultiplier = 0;
        lenisRef.current.scrollTo(top, {
          duration,
          onComplete: () => {
            const drift = el.getBoundingClientRect().top + (options?.offset ?? 0);
            if (Math.abs(drift) > 8 && lenisRef.current) {
              lenisRef.current.scrollTo(pageTop(el, options?.offset ?? 0), {
                immediate: true,
                onComplete: endProgrammatic,
              });
              return;
            }
            endProgrammatic();
          },
        });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        endProgrammatic();
      }
    },
    [beginProgrammatic, endProgrammatic],
  );

  const scrollToOffset = useCallback((
    top: number,
    options?: { immediate?: boolean; duration?: number },
  ) => {
    beginProgrammatic();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(top, {
        immediate: options?.immediate,
        duration: options?.immediate ? 0 : (options?.duration ?? 1.05),
        onComplete: endProgrammatic,
      });
    } else {
      window.scrollTo({ top, behavior: options?.immediate ? "auto" : "smooth" });
      endProgrammatic();
    }
  }, [beginProgrammatic, endProgrammatic]);

  const isProgrammatic = useCallback(() => programmaticRef.current, []);

  return (
    <ScrollContext.Provider value={{ scrollTo, scrollToOffset, subscribeScroll, isProgrammatic }}>
      {children}
    </ScrollContext.Provider>
  );
}
