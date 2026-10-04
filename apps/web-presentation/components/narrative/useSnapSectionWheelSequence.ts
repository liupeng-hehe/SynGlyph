"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  adjacentSnapSection,
  isSectionFullyAway,
  isSectionWheelActive,
  resolveSnapSection,
} from "./sectionScrollUtils";
import { useSmoothScroll } from "./SmoothScrollProvider";

type Options = {
  rootRef: RefObject<HTMLElement | null>;
  itemCount: number;
  activeIndex: number;
  onIndexChange: (index: number) => void;
  stepMs?: number;
  stepMsForIndex?: (index: number) => number;
  entryLockMs?: number;
  consumeWheel?: (index: number, event: WheelEvent) => boolean;
};

/**
 * Mouse/trackpad wheel steps images while this chapter is on screen.
 * The last tick in that direction moves to the next/previous chapter.
 */
export function useSnapSectionWheelSequence({
  rootRef,
  itemCount,
  activeIndex,
  onIndexChange,
  stepMs = 420,
  stepMsForIndex,
  entryLockMs = 0,
  consumeWheel,
}: Options) {
  const smoothScroll = useSmoothScroll();
  const indexRef = useRef(activeIndex);
  const countRef = useRef(itemCount);
  const onIndexChangeRef = useRef(onIndexChange);
  const stepMsForIndexRef = useRef(stepMsForIndex);
  const entryLockMsRef = useRef(entryLockMs);
  const consumeWheelRef = useRef(consumeWheel);
  const scrollToRef = useRef(smoothScroll?.scrollTo);
  const lockRef = useRef(false);
  const wasAwayRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const entryUntilRef = useRef(0);

  indexRef.current = activeIndex;
  countRef.current = itemCount;
  onIndexChangeRef.current = onIndexChange;
  stepMsForIndexRef.current = stepMsForIndex;
  entryLockMsRef.current = entryLockMs;
  consumeWheelRef.current = consumeWheel;
  scrollToRef.current = smoothScroll?.scrollTo;

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    const sectionOf = () => resolveSnapSection(rootRef.current);

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const section = sectionOf();
      if (!section || !isSectionWheelActive(section)) return;

      const goingDown = event.deltaY > 0;
      const index = indexRef.current;
      const maxIndex = Math.max(0, countRef.current - 1);
      const atEnd = index >= maxIndex;
      const atStart = index <= 0;
      const leaving = (goingDown && atEnd) || (!goingDown && atStart);

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (performance.now() < entryUntilRef.current) return;
      if (consumeWheelRef.current?.(index, event)) return;
      if (lockRef.current) return;
      lockRef.current = true;

      if (leaving) {
        const next = adjacentSnapSection(section, goingDown ? 1 : -1);
        if (next) scrollToRef.current?.(next);
        window.setTimeout(() => {
          lockRef.current = false;
        }, 900);
        return;
      }

      if (Math.abs(section.getBoundingClientRect().top) > 12) {
        scrollToRef.current?.(section);
      }
      const nextIndex = goingDown ? index + 1 : index - 1;
      onIndexChangeRef.current(nextIndex);
      window.setTimeout(() => {
        lockRef.current = false;
      }, stepMsForIndexRef.current?.(nextIndex) ?? stepMs);
    };

    const onScroll = () => {
      const section = sectionOf();
      const away = isSectionFullyAway(section);
      if (away) {
        wasAwayRef.current = true;
      } else if (isSectionWheelActive(section) && wasAwayRef.current) {
        wasAwayRef.current = false;
        entryUntilRef.current = performance.now() + (entryLockMsRef.current ?? 0);
        const scrollingDown = window.scrollY >= lastScrollYRef.current;
        const maxIndex = Math.max(0, countRef.current - 1);
        const next = scrollingDown ? 0 : maxIndex;
        if (next !== indexRef.current) onIndexChangeRef.current(next);
      }
      lastScrollYRef.current = window.scrollY;
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("scroll", onScroll);
    };
  }, [rootRef, stepMs]);
}
