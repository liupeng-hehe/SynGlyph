"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useSmoothScroll } from "./SmoothScrollProvider";
import {
  circularBend,
  measureCircularGalleryLayout,
  shortestRelative,
  worldToCss,
  type CircularGalleryLayout,
} from "@/lib/circularGalleryMath";

const SCROLL_VH_PER_ITEM = 110;
const PROGRESS_LERP = 0.055;
const DRAG_THRESHOLD_PX = 8;

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

const DEFAULT_LAYOUT: CircularGalleryLayout = measureCircularGalleryLayout(1280, 640);

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
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const [displayOffset, setDisplayOffset] = useState(0);
  const [layout, setLayout] = useState<CircularGalleryLayout>(DEFAULT_LAYOUT);
  const smoothScroll = useSmoothScroll();

  const total = items.length;
  const maxOffset = Math.max(total - 1, 0);
  const activeIndex = clamp(Math.round(displayOffset), 0, maxOffset);
  const active = items[activeIndex] ?? items[0];
  const posterPx = (layout.plane / layout.viewportW) * layout.screenW;

  const measureLayout = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const { width, height } = ring.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    setLayout(measureCircularGalleryLayout(width, height));
  }, []);

  const scrollOffsetToPageY = useCallback(
    (offset: number) => {
      const track = trackRef.current;
      if (!track) return window.scrollY;
      const scrollable = track.offsetHeight - window.innerHeight;
      const progress = maxOffset <= 0 ? 0 : clamp(offset, 0, maxOffset) / maxOffset;
      return window.scrollY + track.getBoundingClientRect().top + progress * Math.max(scrollable, 0);
    },
    [maxOffset],
  );

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
    targetOffsetRef.current = (scrolled / scrollable) * maxOffset;
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
      const clamped = clamp(index, 0, maxOffset);
      smoothScroll?.scrollToOffset(scrollOffsetToPageY(clamped));
    },
    [maxOffset, scrollOffsetToPageY, smoothScroll],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: displayOffsetRef.current,
      dragging: false,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const deltaX = drag.startX - event.clientX;
      if (!drag.dragging && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;

      if (!drag.dragging) {
        drag.dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const next = clamp(drag.startOffset + deltaX / Math.max(posterPx, 1), 0, maxOffset);
      targetOffsetRef.current = next;
      ensureProgressAnim();
      smoothScroll?.scrollToOffset(scrollOffsetToPageY(next), { immediate: true });
    },
    [ensureProgressAnim, maxOffset, posterPx, scrollOffsetToPageY, smoothScroll],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const didDrag = drag.dragging;
      dragRef.current = null;
      if (!didDrag) return;

      suppressClickRef.current = true;
      goTo(Math.round(targetOffsetRef.current));
    },
    [goTo],
  );

  useLayoutEffect(() => {
    measureLayout();
    const ring = ringRef.current;
    const observer =
      ring && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureLayout)
        : null;
    if (ring && observer) observer.observe(ring);
    window.addEventListener("resize", measureLayout);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureLayout);
    };
  }, [measureLayout]);

  useEffect(() => {
    updateFromScroll();
    displayOffsetRef.current = targetOffsetRef.current;
    setDisplayOffset(targetOffsetRef.current);

    const unsubscribe = smoothScroll?.subscribeScroll(() => {
      if (dragRef.current?.dragging) return;
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
            <div
              className="wordblue-archive__carousel"
              role="tablist"
              aria-label={ariaLabel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div
                ref={ringRef}
                className="wordblue-archive__ring"
                style={
                  {
                    "--poster-w": `${posterPx}px`,
                  } as CSSProperties
                }
              >
                {items.map((item, index) => {
                  const relative = shortestRelative(index, displayOffset, total);
                  const abs = Math.abs(relative);
                  if (abs > 2.45) return null;

                  const worldX = relative * layout.stride;
                  const { y, rotation } = circularBend(
                    worldX,
                    layout.viewportW / 2,
                    layout.bend,
                  );
                  const css = worldToCss(worldX, y, layout);
                  const isActive = index === activeIndex;
                  const fit = item.image.fit ?? "cover";
                  const rotDeg = (-rotation * 180) / Math.PI;
                  const edgeFade = abs > 2.05 ? clamp(1 - (abs - 2.05) / 0.4, 0, 1) : 1;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={item.floorTitle}
                      className={`wordblue-archive__poster${isActive ? " wordblue-archive__poster--active" : ""}`}
                      style={{
                        transform: `translate(calc(-50% + ${css.x.toFixed(2)}px), calc(var(--poster-w) * -0.5 + ${css.y.toFixed(2)}px)) rotate(${rotDeg.toFixed(3)}deg)`,
                        zIndex: Math.round(40 - abs * 8),
                        opacity: edgeFade,
                      }}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        goTo(index);
                      }}
                    >
                      <span className="wordblue-archive__poster-frame">
                        <Image
                          src={item.image.src}
                          alt={item.image.alt}
                          fill
                          sizes="(max-width: 768px) 28vw, 22vw"
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
