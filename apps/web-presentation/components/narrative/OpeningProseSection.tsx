"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { hexToLab, labToHex } from "@/lib/labColor";
import { wordsForText } from "@/lib/paletteFieldV1";

import { useSmoothScroll } from "./SmoothScrollProvider";

const PROSE_PINK = "#ea9dac";
const MINE_FULL_FROM = "Another layer of experience";

function mixHex(from: string, to: string, t: number): string {
  const a = hexToLab(from);
  const b = hexToLab(to);
  const u = Math.max(0, Math.min(1, t));
  return labToHex(a.L + (b.L - a.L) * u, a.a + (b.a - a.a) * u, a.b + (b.b - a.b) * u);
}

/** Keep hue, compress into a dusty pastel range so letters tint instead of stamp. */
function softenMineHex(hex: string): string {
  const lab = hexToLab(hex);
  const chroma = Math.hypot(lab.a, lab.b);
  const scale = chroma > 30 ? 30 / chroma : 1;
  const L = 54 + (lab.L / 100) * 28;
  return labToHex(L, lab.a * scale, lab.b * scale);
}

function proseMineStyle(hex: string, reveal: number) {
  const fill = mixHex(PROSE_PINK, softenMineHex(hex), reveal);
  return {
    color: fill,
    WebkitTextFillColor: fill,
    ["--mine-blur" as string]: "0px",
  };
}

function mineRevealPlan(lines: string[]) {
  const fullFrom = lines.findIndex((line) => line.startsWith(MINE_FULL_FROM));
  const fadeCount = fullFrom < 0 ? lines.length : fullFrom;
  const prefixes: number[] = [];
  let running = 0;
  for (const line of lines) {
    prefixes.push(running);
    running += line.length;
  }
  const fadeLen = lines.slice(0, fadeCount).reduce((sum, line) => sum + line.length, 0) || 1;
  return { fullFrom, prefixes, fadeLen };
}

function revealAt(plan: ReturnType<typeof mineRevealPlan>, lineIndex: number, charIndex: number): number {
  if (plan.fullFrom >= 0 && lineIndex >= plan.fullFrom) return 1;
  const t = Math.max(0, Math.min(1, ((plan.prefixes[lineIndex] ?? 0) + charIndex) / plan.fadeLen));
  return t ** 1.25;
}

function renderMineLine(text: string, revealFor: (charIndex: number) => number) {
  let cursor = 0;
  return wordsForText(text).map((word, wordIndex) => {
    if (word.isSpace) {
      cursor += word.glyphs[0]?.text.length ?? 0;
      return <span key={`s-${wordIndex}`}>{word.glyphs[0]?.text}</span>;
    }
    return (
      <span key={`w-${wordIndex}`} className="opening-prose__mine-word">
        {word.glyphs.map((glyph, index) => {
          const reveal = revealFor(cursor);
          cursor += glyph.text.length;
          if (!glyph.hex) return <span key={index}>{glyph.text}</span>;
          return (
            <span key={index} className="opening-prose__mine-letter" style={proseMineStyle(glyph.hex, reveal)}>
              {glyph.text}
            </span>
          );
        })}
      </span>
    );
  });
}

type Props = {
  chapter: Chapter;
};

const SCROLL_VH_PER_LINE = 108;
const EXIT_UNITS = 1.45;
const EXIT_LIFT_VH = 34;
const BLUR_START = 8.2;
const BLUR_HOLD = 5.2;
const GOO_AMP = 20;
const GOO_OFF = -8;
/** Blob forms, then holds as liquify for most of the line. */
const ARRIVE_END = 0.16;
const RESOLVE_START = 0.64;
/** Goo (visual 0–0.68) occupies most of the line's scroll. */
const GOO_VISUAL = 0.68;
const GOO_SCROLL = 0.76;
const REST_TRANSFORM = "translate3d(-50%, -50%, 0)";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeIn(t: number): number {
  return t * t;
}

function stretchGoo(frac: number): number {
  if (frac < GOO_SCROLL) {
    return (frac / GOO_SCROLL) * GOO_VISUAL;
  }
  return GOO_VISUAL + ((frac - GOO_SCROLL) / (1 - GOO_SCROLL)) * (1 - GOO_VISUAL);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

type ProseLine = {
  text: string;
  paragraph: number;
  globalIndex: number;
};

type ProseParagraph = {
  index: number;
  lines: ProseLine[];
  revealStart: number;
  revealEnd: number;
  exitEnd: number;
};

function sourceParagraphs(chapter: Chapter): ProseParagraph[] {
  const firstRest = (chapter.body[0] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const grouped: string[][] = [
    [chapter.title, ...firstRest],
    ...chapter.body.slice(1).map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ].filter((group) => group.length > 0);

  let cursor = 0;
  let globalIndex = 0;

  return grouped.map((texts, index) => {
    const lines = texts.map((text) => {
      const line = { text, paragraph: index, globalIndex };
      globalIndex += 1;
      return line;
    });
    const revealStart = cursor;
    const revealEnd = cursor + lines.length;
    const exitEnd = index === grouped.length - 1 ? revealEnd : revealEnd + EXIT_UNITS;
    cursor = exitEnd;
    return { index, lines, revealStart, revealEnd, exitEnd };
  });
}

function matrixValues(amp: number, off: number): string {
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${amp} ${off}`;
}

export function OpeningProseSection({ chapter }: Props) {
  const paragraphs = useMemo(() => sourceParagraphs(chapter), [chapter]);
  const lineCount = paragraphs.reduce((sum, paragraph) => sum + paragraph.lines.length, 0);
  const totalUnits = paragraphs[paragraphs.length - 1]?.exitEnd ?? 1;
  const [reduceMotion, setReduceMotion] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const paraRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const blurRefs = useRef<Array<SVGFEGaussianBlurElement | null>>([]);
  const matrixRefs = useRef<Array<SVGFEColorMatrixElement | null>>([]);
  const targetProgressRef = useRef(0);
  const revealedRef = useRef<boolean[]>([]);
  const paraStyleRef = useRef<Array<{ opacity: string; transform: string; hidden: boolean }>>([]);
  const lineShownRef = useRef<Array<boolean | undefined>>([]);
  const lineGooRef = useRef<boolean[]>([]);
  const smoothScroll = useSmoothScroll();

  const setLineShown = useCallback((node: HTMLElement, index: number, visible: boolean) => {
    if (lineShownRef.current[index] === visible) return;
    lineShownRef.current[index] = visible;
    node.dataset.shown = visible ? "1" : "0";
    if (visible) {
      node.style.opacity = "1";
      node.style.height = "";
      node.style.overflow = "visible";
      node.style.padding = "";
      node.setAttribute("aria-hidden", "false");
      return;
    }
    node.style.opacity = "0";
    node.style.height = "0";
    node.style.overflow = "hidden";
    node.style.padding = "0";
    node.style.filter = "none";
    node.setAttribute("aria-hidden", "true");
  }, []);

  const clearLineGoo = useCallback((index: number, node: HTMLElement) => {
    if (lineGooRef.current[index] === false) return;
    lineGooRef.current[index] = false;
    node.style.filter = "none";
    blurRefs.current[index]?.setAttribute("stdDeviation", "0");
    matrixRefs.current[index]?.setAttribute("values", matrixValues(1, 0));
  }, []);

  const applyFrame = useCallback(
    (progress: number) => {
      const pos = progress * totalUnits;

      paragraphs.forEach((paragraph, paragraphIndex) => {
        const group = paraRefs.current[paragraphIndex];
        if (!group) return;

        let opacity = "0";
        let transform = REST_TRANSFORM;
        let hidden = true;

        if (pos < paragraph.revealStart) {
          transform = REST_TRANSFORM;
        } else if (pos <= paragraph.revealEnd) {
          opacity = "1";
          hidden = false;
        } else if (pos < paragraph.exitEnd) {
          const leave = clamp((pos - paragraph.revealEnd) / EXIT_UNITS, 0, 1);
          opacity = String(1 - smoothstep(0.22, 1, leave));
          transform = `${REST_TRANSFORM} translate3d(0, ${(-leave * EXIT_LIFT_VH).toFixed(3)}vh, 0)`;
          hidden = leave > 0.94;
        } else {
          transform = `${REST_TRANSFORM} translate3d(0, ${-EXIT_LIFT_VH}vh, 0)`;
        }

        const prev = paraStyleRef.current[paragraphIndex];
        if (!prev || prev.opacity !== opacity) group.style.opacity = opacity;
        if (!prev || prev.transform !== transform) group.style.transform = transform;
        if (!prev || prev.hidden !== hidden) group.setAttribute("aria-hidden", hidden ? "true" : "false");
        paraStyleRef.current[paragraphIndex] = { opacity, transform, hidden };

        const revealing = pos >= paragraph.revealStart && pos <= paragraph.revealEnd;
        if (!revealing) {
          const showLines = pos > paragraph.revealStart && pos < paragraph.exitEnd;
          paragraph.lines.forEach((line) => {
            const node = lineRefs.current[line.globalIndex];
            if (!node) return;
            setLineShown(node, line.globalIndex, showLines);
            if (showLines) clearLineGoo(line.globalIndex, node);
          });
          return;
        }

        const local = pos - paragraph.revealStart;
        const activeLocal = clamp(Math.floor(local), 0, paragraph.lines.length - 1);
        const frac = local - Math.floor(local);

        paragraph.lines.forEach((line, localIndex) => {
          const node = lineRefs.current[line.globalIndex];
          if (!node) return;

          if (localIndex > activeLocal) {
            setLineShown(node, line.globalIndex, false);
            return;
          }

          setLineShown(node, line.globalIndex, true);

          if (localIndex < activeLocal || frac >= 0.995) {
            revealedRef.current[line.globalIndex] = true;
          }

          if (revealedRef.current[line.globalIndex]) {
            clearLineGoo(line.globalIndex, node);
            return;
          }

          const visual = stretchGoo(frac);
          let std: number;
          if (visual < ARRIVE_END) {
            std = lerp(BLUR_START, BLUR_HOLD, easeOut(visual / ARRIVE_END));
          } else if (visual < RESOLVE_START) {
            std = BLUR_HOLD;
          } else {
            std = lerp(BLUR_HOLD, 0, easeIn((visual - RESOLVE_START) / (1 - RESOLVE_START)));
          }
          const counters = visual < RESOLVE_START ? 0 : easeIn((visual - RESOLVE_START) / (1 - RESOLVE_START));
          lineGooRef.current[line.globalIndex] = true;
          blurRefs.current[line.globalIndex]?.setAttribute("stdDeviation", std.toFixed(2));
          matrixRefs.current[line.globalIndex]?.setAttribute(
            "values",
            matrixValues(lerp(GOO_AMP, 1, counters), lerp(GOO_OFF, 0, counters)),
          );
          node.style.filter = `url(#prose-goo-${line.globalIndex})`;
        });
      });
    },
    [clearLineGoo, paragraphs, setLineShown, totalUnits],
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

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (revealedRef.current.length !== lineCount) {
      revealedRef.current = Array.from({ length: lineCount }, (_, i) => revealedRef.current[i] ?? false);
    }
  }, [lineCount]);

  useEffect(() => {
    if (reduceMotion) return;

    updateFromScroll();
    applyFrame(targetProgressRef.current);

    const onScroll = () => {
      updateFromScroll();
      applyFrame(targetProgressRef.current);
    };

    const unsubscribe = smoothScroll?.subscribeScroll(onScroll);

    const onResize = () => {
      updateFromScroll();
      applyFrame(targetProgressRef.current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      unsubscribe?.();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [applyFrame, reduceMotion, smoothScroll, updateFromScroll]);

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="opening-prose narrative-chapter scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <svg className="opening-prose__defs" aria-hidden="true">
        <defs>
          {paragraphs.flatMap((paragraph) =>
            paragraph.lines.map((line) => (
              <filter
                key={`prose-goo-${line.globalIndex}`}
                id={`prose-goo-${line.globalIndex}`}
                x="-25%"
                y="-25%"
                width="150%"
                height="150%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur
                  ref={(node) => {
                    blurRefs.current[line.globalIndex] = node;
                  }}
                  in="SourceGraphic"
                  stdDeviation={reduceMotion ? 0 : BLUR_START}
                  result="blur"
                />
                <feColorMatrix
                  ref={(node) => {
                    matrixRefs.current[line.globalIndex] = node;
                  }}
                  in="blur"
                  type="matrix"
                  mode="matrix"
                  values={reduceMotion ? matrixValues(1, 0) : matrixValues(GOO_AMP, GOO_OFF)}
                  result="goo"
                />
              </filter>
            )),
          )}
        </defs>
      </svg>

      <div
        ref={trackRef}
        className="opening-prose__track"
        data-scroll-gallery-track
        style={reduceMotion ? undefined : { height: `${Math.max(totalUnits, 1) * SCROLL_VH_PER_LINE}vh` }}
      >
        <div className="opening-prose__sticky">
          <div className="opening-prose__stage">
            {paragraphs.map((paragraph) => (
              <div
                key={`para-${paragraph.index}`}
                ref={(node) => {
                  paraRefs.current[paragraph.index] = node;
                }}
                className={`opening-prose__para opening-prose__para--${paragraph.index === 1 ? "times" : "light"}`}
              >
                {(() => {
                  const minePlan =
                    paragraph.index === 1 ? mineRevealPlan(paragraph.lines.map((item) => item.text)) : null;
                  return paragraph.lines.map((line, localIndex) => {
                  const Tag = paragraph.index === 0 && localIndex === 0 ? "h2" : "p";
                  return (
                    <Tag
                      key={`${line.globalIndex}-${line.text}`}
                      id={paragraph.index === 0 && localIndex === 0 ? `${chapter.id}-title` : undefined}
                      ref={(node: HTMLHeadingElement | HTMLParagraphElement | null) => {
                        lineRefs.current[line.globalIndex] = node;
                      }}
                      className={`opening-prose__line m-0${paragraph.index === 1 ? " opening-prose__line--mine" : ""}`}
                    >
                      {minePlan
                        ? renderMineLine(line.text, (charIndex) => revealAt(minePlan, localIndex, charIndex))
                        : line.text}
                    </Tag>
                  );
                  });
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
