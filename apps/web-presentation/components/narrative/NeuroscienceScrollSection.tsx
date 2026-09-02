"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import type { ScrollGallerySlide } from "@/content/scrollGallerySlides";

import { useSmoothScroll } from "./SmoothScrollProvider";
import { SourcesDrawer } from "./SourcesDrawer";

type Props = {
  chapter: Chapter;
  slides: ScrollGallerySlide[];
  themeClass?: string;
  showBody?: boolean;
};

const SCROLL_VH_PER_SLIDE = 130;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Figure width fraction — fallback until first layout measure. */
const FIGURE_W = 0.312;
const FIGURE_H = FIGURE_W;

/** Gap between img i bottom-right and img i+1 top-left (px). */
const CHAIN_CORNER_GAP_PX = 40;

/** Extra travel along the chain so figures sit farther apart. */
const CHAIN_PATH_GAP = 0.045;

type ChainSpacing = {
  dx: number;
  dy: number;
  gapX: number;
  gapY: number;
};

function chainSpacing(widthPx: number, heightPx: number): ChainSpacing {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 0 || vh <= 0) {
    return {
      dx: FIGURE_W,
      dy: FIGURE_H * (vw / vh),
      gapX: CHAIN_CORNER_GAP_PX / 1200,
      gapY: CHAIN_CORNER_GAP_PX / 900,
    };
  }
  return {
    dx: widthPx / vw,
    dy: heightPx / vh,
    gapX: (widthPx * (CHAIN_CORNER_GAP_PX / (Math.hypot(widthPx, heightPx) || 1))) / vw,
    gapY: (heightPx * (CHAIN_CORNER_GAP_PX / (Math.hypot(widthPx, heightPx) || 1))) / vh,
  };
}

function chainStep(chain: ChainSpacing) {
  return {
    stepX: chain.dx * (1 + CHAIN_PATH_GAP) + chain.gapX,
    stepY: chain.dy * (1 + CHAIN_PATH_GAP) + chain.gapY,
  };
}

/** Extra chain steps after the last slide is centred, so it can reach the top-left. */
const LAST_SLIDE_EXIT_STEPS = 2;

/** Lead travels one step per slide, then the last slide continues to the top-left. */
function travelStepsFor(slideCount: number) {
  return Math.max(slideCount - 1, 1) + LAST_SLIDE_EXIT_STEPS;
}

/** At scroll = 0, image 0 sits below the viewport (right edge flush). */
const ENTRY_BELOW = 0.52;

/** Horizontal inset at entry — 0 keeps the first image flush to the right edge. */
const CHAIN_LEFT_INSET = 0;

/** Horizontal pull as a fraction of full conveyor travel during scroll. */
const HORIZONTAL_PULL = 1;

/** Fade in viewport-centering after the lead image is visible. */
const CENTER_PULL_START = 0.16;
const CENTER_PULL_END = 0.32;

/** First slide opacity ramp (gallery progress 0–1). */
const FIRST_SLIDE_FADE_END = 0.26;

/** Other slides fade-in window after their reveal threshold. */
const SLIDE_REVEAL_FADE = 0.18;

/** Minimal dead zone before gallery progress begins. */
const SCROLL_START = 0.004;

/** Ease scroll-driven progress for smoother image motion. */
const PROGRESS_LERP = 0.11;

/** Subtle pointer parallax on the image canvas (px). */
const PARALLAX_MAX_X = 16;
const PARALLAX_MAX_Y = 12;
const PARALLAX_LERP = 0.07;

/** Ease layout-driven focus centre updates. */
const FOCUS_CENTER_LERP = 0.14;

type FocusCenter = { x: number; y: number };

/** Fallback until layout measure (figure centred in viewport). */
const DEFAULT_FOCUS_CENTER: FocusCenter = { x: 0.34, y: -0.08 };

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Transform (x, y) that places the figure centre on the viewport centre. */
function measureFocusCenter(probe: HTMLElement): FocusCenter | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 0 || vh <= 0) return null;

  const style = getComputedStyle(probe);
  const right = parseFloat(style.right) || 0;
  const bottom = parseFloat(style.bottom) || 0;
  const { width, height } = probe.getBoundingClientRect();
  if (width <= 0 || height <= 0) return null;

  const centerX = vw - right - width / 2;
  const centerY = vh - bottom - height / 2;

  return {
    x: (centerX - vw / 2) / vw,
    y: (vh / 2 - centerY) / vh,
  };
}

function centerPullWeight(galleryProg: number): number {
  return smoothstep(CENTER_PULL_START, CENTER_PULL_END, galleryProg);
}

function galleryProgress(globalProgress: number): number {
  if (globalProgress <= SCROLL_START) return 0;
  return clamp(
    (globalProgress - SCROLL_START) / (1 - SCROLL_START),
    0,
    1,
  );
}

/** Light + caption when the figure reaches 1/3 of the way up the page. */
const LIGHT_LINE_FROM_TOP = 2 / 3;

/** Dim when the figure reaches 2/3 of the way up the page. */
const DARK_LINE_FROM_TOP = 1 / 3;

const LIGHT_LINE_HYSTERESIS_PX = 16;

/** Lead moves from lower-right toward upper-left as progress increases. */
function leadPosition(progress: number, chain: ChainSpacing, travelSteps: number) {
  const { stepX, stepY } = chainStep(chain);
  return {
    x: CHAIN_LEFT_INSET + progress * stepX * travelSteps * HORIZONTAL_PULL,
    y: ENTRY_BELOW * (1 - progress) - progress * stepY * travelSteps,
  };
}

/** Parallel chain: each slide follows the same path, offset by one step. */
function slidePosition(
  progress: number,
  index: number,
  chain: ChainSpacing,
  travelSteps: number,
) {
  const lead = leadPosition(progress, chain, travelSteps);
  const { stepX, stepY } = chainStep(chain);

  return {
    x: lead.x - index * stepX,
    y: lead.y + index * stepY,
  };
}

function viewportBox(viewportEl?: HTMLElement | null) {
  const viewport = viewportEl?.getBoundingClientRect();
  return {
    top: viewport?.top ?? 0,
    height: viewport?.height ?? window.innerHeight,
  };
}

function lightLineY(viewportEl?: HTMLElement | null): number {
  const { top, height } = viewportBox(viewportEl);
  return top + height * LIGHT_LINE_FROM_TOP;
}

function figureYFromTop(
  el: HTMLElement | null,
  viewportEl?: HTMLElement | null,
): number | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const { top, height } = viewportBox(viewportEl);
  if (height <= 0) return null;
  return (rect.top + rect.height / 2 - top) / height;
}

function figureIsPastDarkLine(
  el: HTMLElement | null,
  viewportEl?: HTMLElement | null,
): boolean {
  const yFromTop = figureYFromTop(el, viewportEl);
  if (yFromTop == null) return false;
  return yFromTop <= DARK_LINE_FROM_TOP;
}

function latestSlidePastLightLine(
  figures: Array<HTMLElement | null>,
  previousIndex: number,
  viewportEl?: HTMLElement | null,
): number {
  const line = lightLineY(viewportEl);
  let latest = -1;

  for (let i = 0; i < figures.length; i += 1) {
    const el = figures[i];
    if (!el) continue;

    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;

    const centerY = rect.top + rect.height / 2;
    const threshold = i === previousIndex ? line + LIGHT_LINE_HYSTERESIS_PX : line;
    if (centerY <= threshold) {
      latest = i;
    }
  }

  return latest;
}

function slideOpacity(
  globalProgress: number,
  index: number,
  slideCount: number,
): number {
  const progress = galleryProgress(globalProgress);

  if (index === 0) {
    return smoothstep(0, FIRST_SLIDE_FADE_END, progress);
  }

  if (slideCount <= 1) {
    return smoothstep(0, FIRST_SLIDE_FADE_END, progress);
  }

  const revealAt = (index / (slideCount - 1)) * 0.58;
  const revealEnd = revealAt + SLIDE_REVEAL_FADE;
  if (progress <= revealAt) return 0;

  return smoothstep(revealAt, revealEnd, progress);
}

/** Fade a figure only as it actually leaves the top / left of the page. */
function figureLeaveFade(
  el: HTMLElement | null,
  viewportEl?: HTMLElement | null,
): number {
  if (!el) return 1;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;

  const view = viewportEl?.getBoundingClientRect();
  const left = view?.left ?? 0;
  const top = view?.top ?? 0;
  const right = view?.right ?? window.innerWidth;
  const bottom = view?.bottom ?? window.innerHeight;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const visibleW = Math.min(rect.right, right) - Math.max(rect.left, left);
  const visibleH = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
  if (visibleW <= 0 || visibleH <= 0) {
    const incoming = cy > bottom || cx > right;
    return incoming ? 1 : 0;
  }

  const leaving = cy < midY - 20 || cx < midX - 40;
  if (!leaving) return 1;

  const visibleRatio = (visibleW * visibleH) / (rect.width * rect.height);
  return smoothstep(0.06, 0.58, visibleRatio);
}

/** Bright between the 1/3 and 2/3 page lines; dim before and after. */
function figureLuminance(
  el: HTMLElement | null,
  viewportEl?: HTMLElement | null,
): number {
  if (!el) return 0.52;

  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return 0.52;

  const view = viewportEl?.getBoundingClientRect();
  const top = view?.top ?? 0;
  const height = view?.height ?? window.innerHeight;
  if (height <= 0) return 0.52;

  const yFromTop = (rect.top + rect.height / 2 - top) / height;
  const lit = smoothstep(LIGHT_LINE_FROM_TOP + 0.05, LIGHT_LINE_FROM_TOP - 0.02, yFromTop);
  const unDark = 1 - smoothstep(DARK_LINE_FROM_TOP + 0.03, DARK_LINE_FROM_TOP - 0.08, yFromTop);
  return lerp(0.3, 1, lit * unDark);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function slideMotionStyle(
  globalProgress: number,
  index: number,
  chain: ChainSpacing,
  focusCenter: FocusCenter,
  parallax: { x: number; y: number },
  layoutReady: boolean,
  slideCount: number,
  travelSteps: number,
  captionIndex: number,
  leaveFade = 1,
  luminance = 0.52,
) {
  const progress = galleryProgress(globalProgress);
  const raw = slidePosition(progress, index, chain, travelSteps);
  const travel = progress * travelSteps;
  const activeRaw = slidePositionAtTravel(progress, travel, chain, travelSteps);
  const pull = layoutReady ? centerPullWeight(progress) : 0;

  const x = raw.x + pull * (focusCenter.x - activeRaw.x);
  const y = raw.y + pull * (focusCenter.y - activeRaw.y);

  const reveal = layoutReady ? slideOpacity(globalProgress, index, slideCount) : 0;
  const opacity = reveal * leaveFade;
  const zBase = captionIndex < 0 ? 0 : captionIndex;

  return {
    opacity,
    zIndex: index === captionIndex ? 12 : Math.max(1, 8 - Math.abs(index - zBase)),
    filter: `brightness(${luminance.toFixed(3)})`,
    transform: `translate3d(calc(${-x * 100}vw + ${parallax.x.toFixed(2)}px), calc(${y * 100}vh + ${parallax.y.toFixed(2)}px), 0)`,
  };
}

/** Continuous chain index for centering (avoids discrete jumps between slides). */
function slidePositionAtTravel(
  progress: number,
  travelIndex: number,
  chain: ChainSpacing,
  travelSteps: number,
) {
  const lead = leadPosition(progress, chain, travelSteps);
  const { stepX, stepY } = chainStep(chain);

  return {
    x: lead.x - travelIndex * stepX,
    y: lead.y + travelIndex * stepY,
  };
}

export function ScrollGallerySection({
  chapter,
  slides,
  themeClass = "neuro-scroll-section",
  showBody = true,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const targetProgressRef = useRef(0);
  const displayProgressRef = useRef(0);
  const progressAnimRef = useRef(0);
  const parallaxTargetRef = useRef({ x: 0, y: 0 });
  const parallaxCurrentRef = useRef({ x: 0, y: 0 });
  const parallaxAnimRef = useRef(0);
  const focusCenterTargetRef = useRef<FocusCenter>(DEFAULT_FOCUS_CENTER);
  const focusCenterCurrentRef = useRef<FocusCenter>(DEFAULT_FOCUS_CENTER);
  const focusCenterAnimRef = useRef(0);
  const sectionActiveRef = useRef(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [layoutReady, setLayoutReady] = useState(false);
  const [loadedSlides, setLoadedSlides] = useState<Record<number, boolean>>({});
  const [chain, setChain] = useState<ChainSpacing>(() => ({
    dx: FIGURE_W,
    dy: FIGURE_H,
    gapX: CHAIN_CORNER_GAP_PX / 1200,
    gapY: CHAIN_CORNER_GAP_PX / 900,
  }));
  const [focusCenter, setFocusCenter] = useState<FocusCenter>(DEFAULT_FOCUS_CENTER);
  const [captionIndex, setCaptionIndex] = useState(-1);
  const [captionHidden, setCaptionHidden] = useState(true);
  const [lastImageDark, setLastImageDark] = useState(false);
  const [leaveFade, setLeaveFade] = useState<number[]>([]);
  const [luminance, setLuminance] = useState<number[]>([]);
  const figureRefs = useRef<Array<HTMLElement | null>>([]);
  const captionIndexRef = useRef(-1);
  const slideCount = slides.length;
  const travelSteps = travelStepsFor(slideCount);
  const smoothScroll = useSmoothScroll();

  const syncCaptionToLightLine = useCallback(() => {
    const viewport = stickyRef.current;
    const next = latestSlidePastLightLine(
      figureRefs.current,
      captionIndexRef.current,
      viewport,
    );
    captionIndexRef.current = next;
    setCaptionIndex((prev) => (prev === next ? prev : next));

    const captionDark =
      next >= 0 && figureIsPastDarkLine(figureRefs.current[next], viewport);
    setCaptionHidden(next < 0 || captionDark);
    setLastImageDark(
      figureIsPastDarkLine(figureRefs.current[slideCount - 1], viewport),
    );
  }, [slideCount]);

  const syncFigureVisuals = useCallback(() => {
    const viewport = stickyRef.current;
    const nextFade = figureRefs.current.map((el) => figureLeaveFade(el, viewport));
    const nextLuma = figureRefs.current.map((el) => figureLuminance(el, viewport));

    setLeaveFade((prev) => {
      if (
        prev.length === nextFade.length &&
        prev.every((value, index) => Math.abs(value - nextFade[index]) < 0.012)
      ) {
        return prev;
      }
      return nextFade;
    });

    setLuminance((prev) => {
      if (
        prev.length === nextLuma.length &&
        prev.every((value, index) => Math.abs(value - nextLuma[index]) < 0.012)
      ) {
        return prev;
      }
      return nextLuma;
    });
  }, []);

  const ensureFocusCenterAnim = useCallback(() => {
    if (focusCenterAnimRef.current) return;

    const tick = () => {
      const target = focusCenterTargetRef.current;
      const current = focusCenterCurrentRef.current;
      const next = {
        x: lerp(current.x, target.x, FOCUS_CENTER_LERP),
        y: lerp(current.y, target.y, FOCUS_CENTER_LERP),
      };

      if (
        Math.abs(target.x - next.x) > 0.0003 ||
        Math.abs(target.y - next.y) > 0.0003
      ) {
        focusCenterCurrentRef.current = next;
        setFocusCenter(next);
        focusCenterAnimRef.current = requestAnimationFrame(tick);
      } else {
        focusCenterCurrentRef.current = target;
        setFocusCenter(target);
        focusCenterAnimRef.current = 0;
      }
    };

    focusCenterAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const measureChain = useCallback(() => {
    const probe = measureRef.current;
    if (!probe) return;
    const { width, height } = probe.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    setChain(chainSpacing(width, height));
    const center = measureFocusCenter(probe);
    if (center) {
      focusCenterTargetRef.current = center;
      ensureFocusCenterAnim();
    }
    setLayoutReady(true);
  }, [ensureFocusCenterAnim]);

  const markSlideLoaded = useCallback((index: number) => {
    setLoadedSlides((prev) => {
      if (prev[index]) return prev;
      return { ...prev, [index]: true };
    });
  }, []);

  useLayoutEffect(() => {
    measureChain();
  }, [measureChain]);

  useLayoutEffect(() => {
    syncCaptionToLightLine();
    syncFigureVisuals();
  }, [
    syncCaptionToLightLine,
    syncFigureVisuals,
    scrollProgress,
    layoutReady,
    chain,
    focusCenter,
    parallax,
    slideCount,
  ]);

  useEffect(() => {
    const figures = measureRef.current?.parentElement?.querySelectorAll<HTMLImageElement>(
      ".neuro-scroll-section__figure img",
    );
    figures?.forEach((img, index) => {
      if (img.complete && img.naturalWidth > 0) {
        markSlideLoaded(index);
      }
    });
  }, [markSlideLoaded]);

  const updateFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const viewport = window.innerHeight;
    const scrollable = track.offsetHeight - viewport;
    if (scrollable <= 0) return;

    const scrolled = clamp(-rect.top, 0, scrollable);
    targetProgressRef.current = scrolled / scrollable;
  }, []);

  const ensureProgressAnim = useCallback(() => {
    if (progressAnimRef.current) return;

    const tick = () => {
      const target = targetProgressRef.current;
      const current = displayProgressRef.current;
      const next = lerp(current, target, PROGRESS_LERP);

      if (Math.abs(target - next) > 0.0004) {
        displayProgressRef.current = next;
        setScrollProgress(next);
        progressAnimRef.current = requestAnimationFrame(tick);
      } else {
        displayProgressRef.current = target;
        setScrollProgress(target);
        progressAnimRef.current = 0;
      }
    };

    progressAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureParallaxAnim = useCallback(() => {
    if (parallaxAnimRef.current) return;

    const tick = () => {
      const target = parallaxTargetRef.current;
      const current = parallaxCurrentRef.current;
      const nextX = lerp(current.x, target.x, PARALLAX_LERP);
      const nextY = lerp(current.y, target.y, PARALLAX_LERP);

      if (
        Math.abs(target.x - nextX) > 0.08 ||
        Math.abs(target.y - nextY) > 0.08
      ) {
        parallaxCurrentRef.current = { x: nextX, y: nextY };
        setParallax({ x: nextX, y: nextY });
        parallaxAnimRef.current = requestAnimationFrame(tick);
      } else {
        parallaxCurrentRef.current = { x: target.x, y: target.y };
        setParallax({ x: target.x, y: target.y });
        parallaxAnimRef.current = 0;
      }
    };

    parallaxAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    updateFromScroll();
    displayProgressRef.current = targetProgressRef.current;
    setScrollProgress(targetProgressRef.current);
    measureChain();
    const unsubscribe = smoothScroll?.subscribeScroll(() => {
      updateFromScroll();
      ensureProgressAnim();
    });
    window.addEventListener("resize", updateFromScroll);
    window.addEventListener("resize", measureChain);
    window.addEventListener("resize", syncCaptionToLightLine);
    window.addEventListener("resize", syncFigureVisuals);

    const probe = measureRef.current;
    const observer =
      probe && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureChain)
        : null;
    if (probe && observer) {
      observer.observe(probe);
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handlePointerMove = (event: PointerEvent) => {
      if (reduceMotion || !sectionActiveRef.current) return;

      const sticky = stickyRef.current;
      if (!sticky) return;

      const rect = sticky.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;

      parallaxTargetRef.current = {
        x: -nx * PARALLAX_MAX_X * 2,
        y: -ny * PARALLAX_MAX_Y * 2,
      };
      ensureParallaxAnim();
    };

    const handlePointerLeave = () => {
      parallaxTargetRef.current = { x: 0, y: 0 };
      ensureParallaxAnim();
    };

    const syncSectionActive = () => {
      const track = trackRef.current;
      if (!track) {
        sectionActiveRef.current = false;
        return;
      }
      const rect = track.getBoundingClientRect();
      sectionActiveRef.current =
        rect.top <= window.innerHeight * 0.15 &&
        rect.bottom >= window.innerHeight * 0.55;
    };

    const onScrollOrResize = () => {
      syncSectionActive();
    };

    syncSectionActive();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      unsubscribe?.();
      window.removeEventListener("resize", updateFromScroll);
      window.removeEventListener("resize", measureChain);
      window.removeEventListener("resize", syncCaptionToLightLine);
      window.removeEventListener("resize", syncFigureVisuals);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (progressAnimRef.current) cancelAnimationFrame(progressAnimRef.current);
      if (parallaxAnimRef.current) cancelAnimationFrame(parallaxAnimRef.current);
      if (focusCenterAnimRef.current) cancelAnimationFrame(focusCenterAnimRef.current);
      observer?.disconnect();
    };
  }, [
    smoothScroll,
    updateFromScroll,
    measureChain,
    ensureProgressAnim,
    ensureParallaxAnim,
    syncCaptionToLightLine,
    syncFigureVisuals,
  ]);

  const caption = captionIndex >= 0 ? slides[captionIndex]?.caption ?? "" : "";
  const isSparks = themeClass.includes("neuro-scroll-section--sparks");
  const firstReveal = slideOpacity(scrollProgress, 0, slideCount);
  const heroTitleOpacity = layoutReady ? 1 - smoothstep(0.04, 0.5, firstReveal) : 1;
  const cornerHeaderOpacity = layoutReady
    ? smoothstep(0.18, 0.65, firstReveal) * (lastImageDark ? 0 : 1)
    : 0;

  return (
    <section
      id={chapter.id}
      data-snap-section
      data-nav-theme="dark"
      className={themeClass}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div
        ref={trackRef}
        className="neuro-scroll-section__track"
        data-scroll-gallery-track
        style={{ height: `${(slideCount + LAST_SLIDE_EXIT_STEPS) * SCROLL_VH_PER_SLIDE}vh` }}
      >
        <div className="neuro-scroll-section__sticky" ref={stickyRef}>
          {isSparks ? (
            <p
              className="neuro-scroll-section__hero-title m-0 font-body"
              style={{ opacity: heroTitleOpacity }}
              aria-hidden={heroTitleOpacity < 0.08}
            >
              {chapter.title}
            </p>
          ) : null}

          <header
            className="neuro-scroll-section__header"
            style={isSparks ? { opacity: cornerHeaderOpacity } : undefined}
          >
            <p className="neuro-scroll-section__eyebrow m-0 font-body">
              {chapter.eyebrow}
            </p>
            <h2 id={`${chapter.id}-title`} className="neuro-scroll-section__title m-0 font-body">
              {chapter.title}
            </h2>
          </header>

          <div className="neuro-scroll-section__canvas" aria-live="polite">
            <div
              ref={measureRef}
              className="neuro-scroll-section__figure neuro-scroll-section__figure--measure"
              aria-hidden="true"
            />
            {slides.map((slide, index) => (
              <figure
                key={slide.id}
                ref={(node) => {
                  figureRefs.current[index] = node;
                }}
                className="neuro-scroll-section__figure"
                style={slideMotionStyle(
                  scrollProgress,
                  index,
                  chain,
                  focusCenter,
                  parallax,
                  layoutReady,
                  slideCount,
                  travelSteps,
                  captionIndex,
                  leaveFade[index] ?? 1,
                  luminance[index] ?? 0.52,
                )}
              >
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="(max-width: 960px) 78vw, 34vw"
                  className={`neuro-scroll-section__image${loadedSlides[index] ? " neuro-scroll-section__image--ready" : ""}`}
                  priority={index === 0}
                  onLoad={() => markSlideLoaded(index)}
                />
              </figure>
            ))}
          </div>

          <p
            key={captionIndex}
            className={`neuro-scroll-section__caption m-0 font-body${
              captionHidden ? " neuro-scroll-section__caption--hidden" : ""
            }`}
            aria-hidden={captionHidden}
            aria-live="polite"
          >
            {caption}
          </p>

          <p className="neuro-scroll-section__hint m-0 font-body">
            Scroll to move through the sequence
          </p>
        </div>
      </div>

      {showBody ? (
        <div className="neuro-scroll-section__body">
          <div className="neuro-scroll-section__body-inner">
            {chapter.subtitle ? (
              <p className="neuro-scroll-section__subtitle m-0 font-body">
                {chapter.subtitle}
              </p>
            ) : null}
            <div className="neuro-scroll-section__paragraphs">
              {chapter.body.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="neuro-scroll-section__paragraph m-0 font-body">
                  {paragraph}
                </p>
              ))}
            </div>
            <SourcesDrawer sourceKeys={chapter.sourceKeys} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
