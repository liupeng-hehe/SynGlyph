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

type ScrollApi = {
  scrollTo: (target: string | HTMLElement, options?: { offset?: number }) => void;
  scrollToOffset: (top: number, options?: { immediate?: boolean; duration?: number }) => void;
  subscribeScroll: (callback: () => void) => () => void;
};

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

      const scrolledInto = rect.top <= viewport * 0.12;
      const notFinished = rect.bottom >= viewport * 0.88;
      return scrolledInto && notFinished;
    },
  );
}

function shouldPauseSnap(): boolean {
  return isScrollGalleryActive();
}

function snapTargets(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-snap-section]")];
}

/** Pick the chapter occupying the most viewport — stable full-screen snap. */
function pickSnapSection(sections: HTMLElement[]): HTMLElement | null {
  const vh = window.innerHeight;
  let best: HTMLElement | null = null;
  let bestVisible = -1;

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const visible = Math.max(
      0,
      Math.min(rect.bottom, vh) - Math.max(rect.top, 0),
    );
    if (visible > bestVisible) {
      bestVisible = visible;
      best = section;
    }
  }

  return best;
}

export function SmoothScrollProvider({ children }: Props) {
  const lenisRef = useRef<Lenis | null>(null);
  const snapLockRef = useRef(false);
  const scrollSubscribersRef = useRef(new Set<() => void>());
  const galleryModeRef = useRef(false);

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
      if (snapLockRef.current) return;
      if (shouldPauseSnap()) return;

      const sections = snapTargets();
      const target = pickSnapSection(sections);
      if (!target) return;

      const top = target.getBoundingClientRect().top;
      if (Math.abs(top) < 4) return;

      snapLockRef.current = true;
      lenis.scrollTo(target.offsetTop, {
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
        lenis.options.wheelMultiplier = insideGallery
          ? GALLERY_WHEEL
          : DEFAULT_WHEEL;
      }

      scrollSubscribersRef.current.forEach((callback) => callback());

      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(snapToNearest, insideGallery ? 320 : 140);
    };

    lenis.on("scroll", onScroll);

    return () => {
      window.clearTimeout(snapTimer);
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
    (target: string | HTMLElement, options?: { offset?: number }) => {
      const el =
        typeof target === "string"
          ? document.getElementById(target.replace(/^#/, ""))
          : target;

      if (!el) return;

      snapLockRef.current = true;
      if (lenisRef.current) {
        lenisRef.current.scrollTo(el, {
          offset: options?.offset ?? 0,
          duration: 1.25,
          onComplete: () => {
            snapLockRef.current = false;
          },
        });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        snapLockRef.current = false;
      }
    },
    [],
  );

  const scrollToOffset = useCallback((
    top: number,
    options?: { immediate?: boolean; duration?: number },
  ) => {
    snapLockRef.current = true;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(top, {
        immediate: options?.immediate,
        duration: options?.immediate ? 0 : (options?.duration ?? 1.05),
        onComplete: () => {
          snapLockRef.current = false;
        },
      });
    } else {
      window.scrollTo({ top, behavior: options?.immediate ? "auto" : "smooth" });
      snapLockRef.current = false;
    }
  }, []);

  return (
    <ScrollContext.Provider value={{ scrollTo, scrollToOffset, subscribeScroll }}>
      {children}
    </ScrollContext.Provider>
  );
}
