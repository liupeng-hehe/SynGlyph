"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { hexToLab, labToHex } from "@/lib/labColor";
import { wordsForText } from "@/lib/paletteFieldV1";

import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

const PROSE_PINK = "#ea9dac";
const MINE_FULL_FROM = "Another layer of experience";
const GOO_MS = 1680;
const FLOW_MS = 720;
const EXIT_LOCK_MS = 1250;
const HOLD_MS = 1200;
const FIRST_PARA_HOLD_MS = 2240;
const LINE_STEP_MS = 760;
const BLUR_START = 13.5;
const BLUR_HOLD = 8.6;
const GOO_AMP = 34;
const GOO_OFF = -13;
const ARRIVE_END = 0.22;
const RESOLVE_START = 0.62;

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

type FlowLine = {
  text: string;
  paragraph: number;
  localIndex: number;
  globalIndex: number;
  paraStart: boolean;
  isTitle: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeResolve(t: number): number {
  return t * t * (3 - 2 * t);
}

function sourceLines(chapter: Chapter): FlowLine[] {
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

  const lines: FlowLine[] = [];
  grouped.forEach((texts, paragraph) => {
    texts.forEach((text, localIndex) => {
      lines.push({
        text,
        paragraph,
        localIndex,
        globalIndex: lines.length,
        paraStart: localIndex === 0,
        isTitle: paragraph === 0 && localIndex === 0,
      });
    });
  });
  return lines;
}

function matrixValues(amp: number, off: number): string {
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${amp} ${off}`;
}

function gooAt(t: number): { std: number; amp: number; off: number } {
  if (t < ARRIVE_END) {
    return {
      std: lerp(BLUR_START, BLUR_HOLD, easeOut(t / ARRIVE_END)),
      amp: GOO_AMP,
      off: GOO_OFF,
    };
  }
  if (t < RESOLVE_START) {
    return { std: BLUR_HOLD, amp: GOO_AMP, off: GOO_OFF };
  }
  const resolve = easeResolve((t - RESOLVE_START) / (1 - RESOLVE_START));
  return {
    std: lerp(BLUR_HOLD, 0, resolve),
    amp: lerp(GOO_AMP, 1, resolve),
    off: lerp(GOO_OFF, 0, resolve),
  };
}

export function OpeningProseSection({ chapter }: Props) {
  const lines = useMemo(() => sourceLines(chapter), [chapter]);
  const paragraphGroups = useMemo(() => {
    const groups: Array<{ paragraph: number; lines: FlowLine[] }> = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (!last || last.paragraph !== line.paragraph) {
        groups.push({ paragraph: line.paragraph, lines: [line] });
      } else {
        last.lines.push(line);
      }
    }
    return groups;
  }, [lines]);
  const minePlans = useMemo(() => {
    const plans = new Map<number, ReturnType<typeof mineRevealPlan>>();
    for (const group of paragraphGroups) {
      if (group.paragraph === 1) {
        plans.set(group.paragraph, mineRevealPlan(group.lines.map((line) => line.text)));
      }
    }
    return plans;
  }, [paragraphGroups]);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const blurRefs = useRef<Array<SVGFEGaussianBlurElement | null>>([]);
  const matrixRefs = useRef<Array<SVGFEColorMatrixElement | null>>([]);
  const gooStartedRef = useRef<number[]>([]);
  const gooRafRef = useRef(0);
  const flowReadyRef = useRef(false);
  const activeIndexRef = useRef(0);
  const paragraphStepRef = useRef(false);
  const enterFromExitRef = useRef(false);
  const snapNextRef = useRef(false);
  const isExitingRef = useRef(false);
  const pendingIndexRef = useRef<number | null>(null);
  const exitTimerRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [exitingParagraph, setExitingParagraph] = useState<number | null>(null);
  const [revealIncoming, setRevealIncoming] = useState(true);
  const [flowReady, setFlowReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const maxIndex = Math.max(0, lines.length - 1);
  const activeLine = lines[activeIndex];
  const visibleParagraph = exitingParagraph ?? activeLine?.paragraph ?? 0;

  const setFrameIndex = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(maxIndex, index));
      const fromLine = lines[activeIndexRef.current];
      const toLine = lines[next];
      const crossed = Boolean(fromLine && toLine && fromLine.paragraph !== toLine.paragraph);
      const crossingForward =
        !reduceMotion && Boolean(fromLine && toLine && toLine.paragraph > fromLine.paragraph);

      if (isExitingRef.current) {
        paragraphStepRef.current = true;
        return;
      }

      paragraphStepRef.current = crossed;

      if (crossingForward && fromLine) {
        isExitingRef.current = true;
        pendingIndexRef.current = next;
        setRevealIncoming(false);
        setExitingParagraph(fromLine.paragraph);
        return;
      }

      if (!reduceMotion && fromLine && toLine && toLine.paragraph < fromLine.paragraph) {
        enterFromExitRef.current = true;
      }
      isExitingRef.current = false;
      pendingIndexRef.current = null;
      setExitingParagraph(null);
      activeIndexRef.current = next;
      setActiveIndex(next);
    },
    [lines, maxIndex, reduceMotion],
  );

  const isLastLineOfParagraph = useCallback((index: number) => {
    const line = lines[index];
    const next = lines[index + 1];
    return Boolean(line && (!next || next.paragraph !== line.paragraph));
  }, [lines]);

  useSnapSectionWheelSequence({
    rootRef,
    itemCount: lines.length,
    activeIndex,
    onIndexChange: setFrameIndex,
    stepMs: LINE_STEP_MS,
    stepMsForIndex: (nextIndex) => {
      if (paragraphStepRef.current) return EXIT_LOCK_MS;
      if (isLastLineOfParagraph(nextIndex)) {
        return lines[nextIndex]?.paragraph === 0 ? FIRST_PARA_HOLD_MS : HOLD_MS;
      }
      return LINE_STEP_MS;
    },
  });

  const applyGoo = useCallback((index: number, t: number) => {
    const node = lineRefs.current[index];
    const done = t >= 1;
    if (done) {
      blurRefs.current[index]?.setAttribute("stdDeviation", "0");
      matrixRefs.current[index]?.setAttribute("values", matrixValues(1, 0));
      if (node) node.style.filter = "none";
      return;
    }
    const goo = gooAt(t);
    blurRefs.current[index]?.setAttribute("stdDeviation", goo.std.toFixed(2));
    matrixRefs.current[index]?.setAttribute("values", matrixValues(goo.amp, goo.off));
    if (node) node.style.filter = `url(#prose-goo-${index})`;
  }, []);

  const tickGoo = useCallback(
    (now: number) => {
      let running = false;
      gooStartedRef.current.forEach((start, index) => {
        if (!start) return;
        const t = clamp((now - start) / GOO_MS, 0, 1);
        applyGoo(index, t);
        if (t >= 1) gooStartedRef.current[index] = 0;
        else running = true;
      });
      gooRafRef.current = running ? window.requestAnimationFrame(tickGoo) : 0;
    },
    [applyGoo],
  );

  const startGoo = useCallback(
    (index: number) => {
      if (reduceMotion) return;
      gooStartedRef.current[index] = performance.now();
      if (!gooRafRef.current) {
        gooRafRef.current = window.requestAnimationFrame(tickGoo);
      }
    },
    [reduceMotion, tickGoo],
  );

  const markFlowReady = useCallback(() => {
    if (flowReadyRef.current) return;
    flowReadyRef.current = true;
    window.requestAnimationFrame(() => setFlowReady(true));
  }, []);

  const setFlowY = useCallback((y: number) => {
    const flow = flowRef.current;
    if (!flow) return;
    flow.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    markFlowReady();
  }, [markFlowReady]);

  const alignShownBlock = useCallback((index: number) => {
    const stage = stageRef.current;
    const current = lines[index];
    if (!stage || !current) return;
    const shown = lines.filter((line) => line.paragraph === current.paragraph && line.globalIndex <= index);
    const first = lineRefs.current[shown[0]?.globalIndex ?? -1];
    const last = lineRefs.current[shown[shown.length - 1]?.globalIndex ?? -1];
    if (!first || !last) return;
    const top = first.offsetTop;
    const bottom = last.offsetTop + last.offsetHeight;
    const mid = (top + bottom) / 2;
    const blockH = bottom - top;
    const safeTop = stage.clientHeight * 0.06;
    const safeBottom = stage.clientHeight * 0.94;
    const avail = safeBottom - safeTop;
    let y = stage.clientHeight * 0.5 - mid;
    if (blockH >= avail) {
      y = (stage.clientHeight - blockH) / 2 - top;
    } else {
      if (top + y < safeTop) y = safeTop - top;
      if (bottom + y > safeBottom) y = safeBottom - bottom;
    }
    setFlowY(y);
  }, [lines, setFlowY]);

  const alignExit = useCallback((paragraph: number) => {
    const stage = stageRef.current;
    const paraLines = lines.filter((line) => line.paragraph === paragraph);
    const last = lineRefs.current[paraLines[paraLines.length - 1]?.globalIndex ?? -1];
    if (!stage || !last) return;
    setFlowY(-(last.offsetTop + last.offsetHeight) - stage.clientHeight * 0.1);
  }, [lines, setFlowY]);

  const snapToBlock = useCallback((index: number) => {
    const flow = flowRef.current;
    flow?.classList.remove("is-ready");
    alignShownBlock(index);
    if (flow) void flow.offsetWidth;
    if (!reduceMotion) flow?.classList.add("is-ready");
  }, [alignShownBlock, reduceMotion]);

  const alignFlow = useCallback(() => {
    if (exitingParagraph !== null) alignExit(exitingParagraph);
    else alignShownBlock(activeIndex);
  }, [activeIndex, alignExit, alignShownBlock, exitingParagraph]);
  const alignFlowRef = useRef(alignFlow);
  alignFlowRef.current = alignFlow;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (reduceMotion) {
      alignShownBlock(activeIndex);
      return;
    }

    if (exitingParagraph !== null) {
      alignExit(exitingParagraph);
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = window.setTimeout(() => {
        const pending = pendingIndexRef.current;
        pendingIndexRef.current = null;
        isExitingRef.current = false;
        snapNextRef.current = true;
        if (pending !== null) {
          activeIndexRef.current = pending;
          setActiveIndex(pending);
        }
        setExitingParagraph(null);
      }, FLOW_MS);
      return () => window.clearTimeout(exitTimerRef.current);
    }

    if (snapNextRef.current) {
      snapNextRef.current = false;
      snapToBlock(activeIndex);
      setRevealIncoming(true);
      return;
    }

    if (enterFromExitRef.current) {
      enterFromExitRef.current = false;
      flow?.classList.remove("is-ready");
      alignExit(activeLine?.paragraph ?? 0);
      if (flow) void flow.offsetWidth;
      flow?.classList.add("is-ready");
      alignShownBlock(activeIndex);
      return;
    }

    alignShownBlock(activeIndex);
  }, [activeIndex, activeLine?.paragraph, alignExit, alignShownBlock, exitingParagraph, reduceMotion, snapToBlock]);

  useEffect(() => {
    if (reduceMotion || exitingParagraph !== null || !revealIncoming) return;
    startGoo(activeIndex);
  }, [activeIndex, exitingParagraph, reduceMotion, revealIncoming, startGoo]);

  useEffect(() => {
    if (reduceMotion || exitingParagraph !== null || isExitingRef.current) return;
    const line = lines[activeIndex];
    const next = lines[activeIndex + 1];
    if (!line || line.paragraph !== 0 || !next || next.paragraph === line.paragraph) return;

    const timer = window.setTimeout(() => {
      setFrameIndex(activeIndex + 1);
    }, FIRST_PARA_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, exitingParagraph, lines, reduceMotion, setFrameIndex]);

  useEffect(() => {
    const onResize = () => alignFlowRef.current();
    window.addEventListener("resize", onResize);
    void document.fonts?.ready.then(() => alignFlowRef.current());
    return () => {
      window.removeEventListener("resize", onResize);
      if (gooRafRef.current) {
        window.cancelAnimationFrame(gooRafRef.current);
        gooRafRef.current = 0;
      }
    };
  }, []);

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="opening-prose narrative-chapter scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <svg className="opening-prose__defs" aria-hidden="true">
        <defs>
          {lines.map((line) => (
            <filter
              key={`prose-goo-${line.globalIndex}`}
              id={`prose-goo-${line.globalIndex}`}
              x="-45%"
              y="-45%"
              width="190%"
              height="190%"
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
          ))}
        </defs>
      </svg>

      <div
        ref={rootRef}
        className="opening-prose__stage"
        data-wheel-sequence
        data-wheel-at={activeIndex <= 0 ? "start" : activeIndex >= maxIndex ? "end" : "mid"}
        tabIndex={0}
      >
        <div ref={stageRef} className="opening-prose__window">
          <div ref={flowRef} className={`opening-prose__flow${flowReady && !reduceMotion ? " is-ready" : ""}`}>
            {paragraphGroups.map((group) => {
              const onStage = reduceMotion || group.paragraph === visibleParagraph;
              const pendingEnter =
                !reduceMotion &&
                exitingParagraph === null &&
                !revealIncoming &&
                group.paragraph === visibleParagraph;
              return (
                <div
                  key={group.paragraph}
                  className={`opening-prose__para-block${onStage ? " is-current" : ""}${pendingEnter ? " is-pending" : ""}${group.paragraph === 1 ? " opening-prose__para-block--times" : ""}`}
                  aria-hidden={onStage ? "false" : "true"}
                >
                  {group.lines.map((line) => {
                    const Tag = line.isTitle ? "h2" : "p";
                    const minePlan = minePlans.get(line.paragraph);
                    const shown =
                      reduceMotion ||
                      (group.paragraph === visibleParagraph &&
                        (exitingParagraph !== null || line.globalIndex <= activeIndex));
                    return (
                      <Tag
                        key={`${line.globalIndex}-${line.text}`}
                        id={line.isTitle ? `${chapter.id}-title` : undefined}
                        ref={(node: HTMLHeadingElement | HTMLParagraphElement | null) => {
                          lineRefs.current[line.globalIndex] = node;
                        }}
                        className={`opening-prose__line m-0${line.paragraph === 1 ? " opening-prose__line--mine" : ""}${line.paragraph === 1 ? " opening-prose__line--times" : ""}${shown ? " is-in" : ""}`}
                        aria-hidden={shown ? "false" : "true"}
                      >
                        {minePlan
                          ? renderMineLine(line.text, (charIndex) => revealAt(minePlan, line.localIndex, charIndex))
                          : line.text}
                      </Tag>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
