"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { useSmoothScroll } from "./SmoothScrollProvider";
import { SourcesDrawer } from "./SourcesDrawer";

type Props = {
  chapter: Chapter;
};

const SCROLL_VH_PER_STEP = 85;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function OpeningProseSection({ chapter }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const targetProgressRef = useRef(0);
  const displayProgressRef = useRef(0);
  const progressAnimRef = useRef(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const smoothScroll = useSmoothScroll();

  const steps = chapter.body.length;
  const activeIndex = clamp(Math.floor(scrollProgress * steps), 0, steps - 1);
  const bgProgress = clamp(scrollProgress * 1.15, 0, 1);

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
      const next = lerp(current, target, 0.12);

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

  useEffect(() => {
    updateFromScroll();
    displayProgressRef.current = targetProgressRef.current;
    setScrollProgress(targetProgressRef.current);

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

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="opening-prose narrative-chapter scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
      style={
        {
          "--opening-prose-bg": bgProgress,
        } as CSSProperties
      }
    >
      <div
        ref={trackRef}
        className="opening-prose__track"
        data-scroll-gallery-track
        style={{ height: `${Math.max(steps, 1) * SCROLL_VH_PER_STEP}vh` }}
      >
        <div className="opening-prose__sticky">
          <div className="opening-prose__inner">
            <p className="opening-prose__kicker m-0 font-body">Prologue</p>
            <p className="opening-prose__eyebrow m-0 font-body">02 / Prologue</p>
            <h2 id={`${chapter.id}-title`} className="opening-prose__title m-0 font-body">
              {chapter.title}
            </h2>

            <div className="opening-prose__stage" aria-live="polite">
              {chapter.body.map((paragraph, index) => {
                const distance = Math.abs(index - activeIndex);
                const visible = distance === 0;
                return (
                  <p
                    key={paragraph.slice(0, 48)}
                    className={`opening-prose__paragraph m-0 font-body${visible ? " opening-prose__paragraph--active" : ""}`}
                    aria-hidden={!visible}
                  >
                    {paragraph}
                  </p>
                );
              })}
            </div>

            <div className="opening-prose__sources">
              <SourcesDrawer sourceKeys={chapter.sourceKeys} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
