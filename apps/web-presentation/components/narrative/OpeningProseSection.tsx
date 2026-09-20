"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { useSmoothScroll } from "./SmoothScrollProvider";

type Props = {
  chapter: Chapter;
};

const SCROLL_VH_PER_LINE = 78;
const BLUR_START = 8.2;
const BLUR_HOLD = 5.2;
const GOO_AMP = 20;
const GOO_OFF = -8;
const BIRTH_Y = 0.55;
const PROGRESS_LERP = 0.13;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sourceLines(chapter: Chapter): string[] {
  return [chapter.title, ...chapter.body.flatMap((paragraph) => paragraph.split("\n"))].filter(
    (line) => line.trim().length > 0,
  );
}

function matrixValues(amp: number, off: number): string {
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${amp} ${off}`;
}

export function OpeningProseSection({ chapter }: Props) {
  const lines = useMemo(() => sourceLines(chapter), [chapter]);
  const [reduceMotion, setReduceMotion] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const blurRefs = useRef<Array<SVGFEGaussianBlurElement | null>>([]);
  const matrixRefs = useRef<Array<SVGFEColorMatrixElement | null>>([]);
  const targetProgressRef = useRef(0);
  const displayProgressRef = useRef(0);
  const progressAnimRef = useRef(0);
  const smoothScroll = useSmoothScroll();

  const applyFrame = useCallback(
    (progress: number) => {
      const stack = stackRef.current;
      const sticky = stickyRef.current;
      if (!stack || !sticky) return;

      const count = lines.length;
      if (count === 0) return;

      const gap = Number.parseFloat(getComputedStyle(stack).rowGap || getComputedStyle(stack).gap) || 0;
      const heights = lineRefs.current.map((node) => node?.offsetHeight ?? 0);
      const prefix: number[] = [];
      let acc = 0;
      for (let i = 0; i < count; i += 1) {
        prefix.push(acc);
        acc += heights[i] + (i < count - 1 ? gap : 0);
      }

      const scaled = progress * count;
      const active = progress >= 0.999 ? count - 1 : clamp(Math.floor(scaled), 0, count - 1);
      const frac = progress >= 0.999 ? 1 : scaled - Math.floor(scaled);
      const lift = smoothstep(0.55, 1, frac);
      const birthY = sticky.clientHeight * BIRTH_Y;
      const shift = (prefix[active] ?? 0) + lift * ((heights[active] ?? 0) + gap);
      stack.style.transform = `translate3d(0, ${birthY - shift}px, 0)`;

      for (let i = 0; i < count; i += 1) {
        const node = lineRefs.current[i];
        const blur = blurRefs.current[i];
        const matrix = matrixRefs.current[i];
        if (!node) continue;

        if (i > active) {
          node.style.opacity = "0";
          node.style.filter = "none";
          node.setAttribute("aria-hidden", "true");
          continue;
        }

        node.style.opacity = "1";
        node.setAttribute("aria-hidden", "false");

        if (i < active) {
          node.style.filter = "none";
          blur?.setAttribute("stdDeviation", "0");
          matrix?.setAttribute("values", matrixValues(1, 0));
          continue;
        }

        // Hard-edged metaball, not a fog copy of the same letters:
        // 1) words arrive already melted (counters filled, stems fused)
        // 2) hold while the silhouette splits back into glyphs
        // 3) only then drop the contrast so counters punch open
        let std: number;
        if (frac < 0.42) {
          std = lerp(BLUR_START, BLUR_HOLD, easeOut(frac / 0.42));
        } else if (frac < 0.72) {
          std = BLUR_HOLD;
        } else {
          std = lerp(BLUR_HOLD, 0, easeOut((frac - 0.72) / 0.28));
        }
        const counters = frac < 0.72 ? 0 : easeOut((frac - 0.72) / 0.28);
        const amp = lerp(GOO_AMP, 1, counters);
        const off = lerp(GOO_OFF, 0, counters);

        if (frac >= 0.995) {
          node.style.filter = "none";
          blur?.setAttribute("stdDeviation", "0");
          matrix?.setAttribute("values", matrixValues(1, 0));
        } else {
          blur?.setAttribute("stdDeviation", std.toFixed(2));
          matrix?.setAttribute("values", matrixValues(amp, off));
          node.style.filter = `url(#prose-goo-${i})`;
        }
      }
    },
    [lines.length],
  );

  const updateFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const scrollable = track.offsetHeight - window.innerHeight;
    if (scrollable <= 0) {
      targetProgressRef.current = 1;
      return;
    }
    const scrolled = clamp(-track.getBoundingClientRect().top, 0, scrollable);
    targetProgressRef.current = scrolled / scrollable;
  }, []);

  const ensureProgressAnim = useCallback(() => {
    if (progressAnimRef.current) return;

    const tick = () => {
      const target = targetProgressRef.current;
      const next = lerp(displayProgressRef.current, target, PROGRESS_LERP);
      if (Math.abs(target - next) > 0.00035) {
        displayProgressRef.current = next;
        applyFrame(next);
        progressAnimRef.current = requestAnimationFrame(tick);
      } else {
        displayProgressRef.current = target;
        applyFrame(target);
        progressAnimRef.current = 0;
      }
    };

    progressAnimRef.current = requestAnimationFrame(tick);
  }, [applyFrame]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    updateFromScroll();
    displayProgressRef.current = targetProgressRef.current;
    applyFrame(displayProgressRef.current);

    const unsubscribe = smoothScroll?.subscribeScroll(() => {
      updateFromScroll();
      ensureProgressAnim();
    });

    const onResize = () => {
      updateFromScroll();
      applyFrame(displayProgressRef.current);
    };

    window.addEventListener("resize", onResize);

    return () => {
      unsubscribe?.();
      window.removeEventListener("resize", onResize);
      if (progressAnimRef.current) cancelAnimationFrame(progressAnimRef.current);
    };
  }, [applyFrame, ensureProgressAnim, reduceMotion, smoothScroll, updateFromScroll]);

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="opening-prose narrative-chapter scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <svg className="opening-prose__defs" aria-hidden="true">
        <defs>
          {lines.map((_, index) => (
            <filter
              key={`prose-goo-${index}`}
              id={`prose-goo-${index}`}
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                ref={(node) => {
                  blurRefs.current[index] = node;
                }}
                in="SourceGraphic"
                stdDeviation={reduceMotion ? 0 : BLUR_START}
                result="blur"
              />
              <feColorMatrix
                ref={(node) => {
                  matrixRefs.current[index] = node;
                }}
                in="blur"
                type="matrix"
                mode="matrix"
                values={reduceMotion ? matrixValues(1, 0) : matrixValues(GOO_AMP, GOO_OFF)}
                result="goo"
              />
            </filter>
          ))}
        </defs>
      </svg>

      <div
        ref={trackRef}
        className="opening-prose__track"
        data-scroll-gallery-track
        style={reduceMotion ? undefined : { height: `${Math.max(lines.length, 1) * SCROLL_VH_PER_LINE}vh` }}
      >
        <div ref={stickyRef} className="opening-prose__sticky">
          <div ref={stackRef} className="opening-prose__stack">
            {lines.map((line, index) => {
              const Tag = index === 0 ? "h2" : "p";
              return (
                <Tag
                  key={`${index}-${line}`}
                  id={index === 0 ? `${chapter.id}-title` : undefined}
                  ref={(node: HTMLHeadingElement | HTMLParagraphElement | null) => {
                    lineRefs.current[index] = node;
                  }}
                  className="opening-prose__line m-0 font-display"
                >
                  {line}
                </Tag>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
