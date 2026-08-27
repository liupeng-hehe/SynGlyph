"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useSmoothScroll } from "./SmoothScrollProvider";

/** Fixed arc half-width (slots −2 … +2). */
const VISIBLE_SPAN = 2;

const SCROLL_VH_PER_ITEM = 110;
const PROGRESS_LERP = 0.11;

export type ArcArchiveItem = {
  id: string;
  posterLabel: string;
  floorTitle: string;
  floorMeta: string;
  floorTags: string;
  description: string;
  image: {
    src: string;
    alt: string;
    fit?: "cover" | "contain";
  };
};

type ArcLayout = {
  radius: number;
  stepDeg: number;
  sag: number;
  posterWidth: number;
};

const DEFAULT_ARC: ArcLayout = {
  radius: 520,
  stepDeg: 16,
  sag: 188,
  posterWidth: 248,
};

type Props = {
  items: ArcArchiveItem[];
  sectionId?: string;
  sectionClassName?: string;
  ariaLabel: string;
  hint?: string;
  scrollVhPerItem?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function measureArcLayout(ringWidth: number): ArcLayout {
  const inner = Math.max(ringWidth, 320);
  const gap = inner * 0.012;
  const posterWidth = ((inner - gap * 4) / 5) * 0.96;
  const stepDeg = 16;
  const maxRad = (VISIBLE_SPAN * stepDeg * Math.PI) / 180;
  const outerX = inner / 2 - posterWidth / 2 - 2;
  const radius = Math.max(200, outerX / Math.sin(maxRad));
  const sag = radius * 0.36;

  return { radius, stepDeg, sag, posterWidth };
}

function opacityForDistance(abs: number): number {
  if (abs <= 0.2) return 1;
  if (abs <= 1.2) return 0.5;
  return 0.25;
}

function arcTransform(relativeIndex: number, arc: ArcLayout): CSSProperties {
  const abs = Math.abs(relativeIndex);
  const angleDeg = relativeIndex * arc.stepDeg;
  const rad = (angleDeg * Math.PI) / 180;

  const x = Math.sin(rad) * arc.radius;
  const uplift = clamp(1 - abs * 1.6, 0, 1) * 14;
  const y = (1 - Math.cos(rad)) * arc.sag - uplift;
  const rotate = angleDeg * 0.92;
  const scale = clamp(1.04 - abs * 0.025, 0.92, 1.04);
  const opacity = opacityForDistance(abs);

  return {
    transform: `translate(calc(-50% + ${x.toFixed(2)}px), ${y.toFixed(2)}px) rotate(${rotate.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
    transformOrigin: "50% 88%",
    opacity,
    zIndex: Math.round(120 - abs * 10),
  };
}

export function ArcArchiveFloor({
  items,
  sectionId,
  sectionClassName = "wordblue-archive",
  ariaLabel,
  hint = "Scroll to move through the works — the page continues after the last piece.",
  scrollVhPerItem = SCROLL_VH_PER_ITEM,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const targetOffsetRef = useRef(0);
  const displayOffsetRef = useRef(0);
  const progressAnimRef = useRef(0);

  const [displayOffset, setDisplayOffset] = useState(0);
  const [arcLayout, setArcLayout] = useState<ArcLayout>(DEFAULT_ARC);
  const smoothScroll = useSmoothScroll();

  const total = items.length;
  const maxOffset = Math.max(total - 1, 0);
  const activeIndex = clamp(Math.round(displayOffset), 0, maxOffset);
  const active = items[activeIndex] ?? items[0];

  const measureArc = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const { width } = ring.getBoundingClientRect();
    if (width <= 0) return;
    setArcLayout(measureArcLayout(width));
  }, []);

  const updateFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const viewport = window.innerHeight;
    const scrollable = track.offsetHeight - viewport;
    if (scrollable <= 0) {
      targetOffsetRef.current = 0;
      return;
    }

    const scrolled = clamp(-rect.top, 0, scrollable);
    const progress = scrolled / scrollable;
    targetOffsetRef.current = progress * maxOffset;
  }, [maxOffset]);

  const ensureProgressAnim = useCallback(() => {
    if (progressAnimRef.current) return;

    const tick = () => {
      const target = targetOffsetRef.current;
      const current = displayOffsetRef.current;
      const next = lerp(current, target, PROGRESS_LERP);

      if (Math.abs(target - next) > 0.0015) {
        displayOffsetRef.current = next;
        setDisplayOffset(next);
        progressAnimRef.current = requestAnimationFrame(tick);
      } else {
        displayOffsetRef.current = target;
        setDisplayOffset(target);
        progressAnimRef.current = 0;
      }
    };

    progressAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;

      const clamped = clamp(index, 0, maxOffset);
      const scrollable = track.offsetHeight - window.innerHeight;
      const progress = maxOffset <= 0 ? 0 : clamped / maxOffset;
      const targetScroll =
        window.scrollY + track.getBoundingClientRect().top + progress * scrollable;

      smoothScroll?.scrollToOffset(targetScroll);
    },
    [maxOffset, smoothScroll],
  );

  useLayoutEffect(() => {
    measureArc();
    const ring = ringRef.current;
    const observer =
      ring && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureArc)
        : null;
    if (ring && observer) observer.observe(ring);
    window.addEventListener("resize", measureArc);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureArc);
    };
  }, [measureArc]);

  useEffect(() => {
    updateFromScroll();
    displayOffsetRef.current = targetOffsetRef.current;
    setDisplayOffset(targetOffsetRef.current);

    const unsubscribe = smoothScroll?.subscribeScroll(() => {
      updateFromScroll();
      ensureProgressAnim();
    });
    window.addEventListener("resize", updateFromScroll);

    return () => {
      unsubscribe?.();
      window.removeEventListener("resize", updateFromScroll);
      if (progressAnimRef.current) cancelAnimationFrame(progressAnimRef.current);
    };
  }, [smoothScroll, updateFromScroll, ensureProgressAnim]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView) return;

      if (event.key === "ArrowRight") goTo(activeIndex + 1);
      if (event.key === "ArrowLeft") goTo(activeIndex - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goTo]);

  if (!active) return null;

  return (
    <section
      id={sectionId}
      {...(sectionId ? { "data-snap-section": true } : {})}
      className={sectionClassName}
      aria-label={ariaLabel}
    >
      <div
        ref={trackRef}
        className="wordblue-archive__track"
        data-scroll-gallery-track
        style={{ height: `${Math.max(total, 1) * scrollVhPerItem}vh` }}
      >
        <div className="wordblue-archive__sticky">
          <div className="wordblue-archive__stage">
            {sectionClassName.includes("synesthetes") ? (
              <p className="wordblue-archive__badge m-0 font-body" aria-hidden="true">
                Artists on Synesthetes
              </p>
            ) : null}
            <div className="wordblue-archive__carousel" role="tablist" aria-label={ariaLabel}>
              <div
                ref={ringRef}
                className="wordblue-archive__ring"
                style={
                  {
                    "--poster-w": `${arcLayout.posterWidth}px`,
                  } as CSSProperties
                }
              >
                {items.map((item, index) => {
                  const relative = index - displayOffset;
                  if (Math.abs(relative) > VISIBLE_SPAN + 0.02) return null;

                  const isActive = index === activeIndex;
                  const fit = item.image.fit ?? "cover";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={item.floorTitle}
                      className={`wordblue-archive__poster${isActive ? " wordblue-archive__poster--active" : ""}`}
                      style={arcTransform(relative, arcLayout)}
                      onClick={() => goTo(index)}
                    >
                      <span className="wordblue-archive__poster-frame">
                        <Image
                          src={item.image.src}
                          alt={item.image.alt}
                          fill
                          sizes="(max-width: 768px) 20vw, 18vw"
                          className={`wordblue-archive__poster-image wordblue-archive__poster-image--${fit}`}
                          draggable={false}
                          priority={index <= 2}
                        />
                      </span>
                      <span className="wordblue-archive__poster-caption font-body">
                        {item.posterLabel}
                      </span>
                      {isActive ? (
                        <span className="wordblue-archive__poster-pin" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wordblue-archive__rule" aria-hidden="true" />
          </div>

          <div className="wordblue-archive__floor">
            <div className="wordblue-archive__lead" aria-live="polite">
              <p className="wordblue-archive__index m-0 font-body">
                {String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </p>
              <h2 className="wordblue-archive__title m-0 font-body">{active.floorTitle}</h2>
              <p className="wordblue-archive__meta m-0 font-body">{active.floorMeta}</p>
              <p className="wordblue-archive__tags m-0 font-body">{active.floorTags}</p>
            </div>

            <p className="wordblue-archive__description m-0 font-body">{active.description}</p>

            <ol className="wordblue-archive__nav m-0 list-none p-0">
              {items.map((item, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`wordblue-archive__nav-item font-body${isActive ? " wordblue-archive__nav-item--active" : ""}`}
                      onClick={() => goTo(index)}
                    >
                      {String(index + 1).padStart(2, "0")} {item.posterLabel}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="wordblue-archive__hint m-0 font-body">{hint}</p>
        </div>
      </div>
    </section>
  );
}
