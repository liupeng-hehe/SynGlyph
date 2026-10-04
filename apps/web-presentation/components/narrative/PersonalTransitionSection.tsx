"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { PersonalMineReading } from "./PersonalMineReading";
import { SourcesDrawer } from "./SourcesDrawer";
import { useSmoothScroll } from "./SmoothScrollProvider";
import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type Props = {
  chapter: Chapter;
};

const HOLD_STEPS = 3;
const PARKED_INDEX = 1;

export function PersonalTransitionSection({ chapter }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const [holdIndex, setHoldIndex] = useState(PARKED_INDEX);
  const edgeHoldRef = useRef({ up: 2, down: 0 });
  const edgeGateRef = useRef(0);
  const scroll = useSmoothScroll();

  useEffect(() => {
    if (holdIndex === PARKED_INDEX) {
      edgeHoldRef.current = { up: 2, down: 0 };
    }
  }, [holdIndex]);

  const consumeMineWheel = useCallback((index: number, event: WheelEvent) => {
    const now = performance.now();
    const holdUp = event.deltaY < 0 && index <= 0;
    const holdDown = event.deltaY > 0 && index >= HOLD_STEPS - 1;
    if (!holdUp && !holdDown) return false;
    if (now < edgeGateRef.current) return true;

    const remaining = holdUp ? edgeHoldRef.current.up : edgeHoldRef.current.down;
    if (remaining <= 0) return false;

    if (holdUp) edgeHoldRef.current.up -= 1;
    else edgeHoldRef.current.down -= 1;
    edgeGateRef.current = now + 820;

    const section = sectionRef.current;
    if (section && Math.abs(section.getBoundingClientRect().top) > 12) {
      scroll?.scrollTo(section);
    }
    return true;
  }, [scroll]);

  useSnapSectionWheelSequence({
    rootRef: sectionRef,
    itemCount: HOLD_STEPS,
    activeIndex: holdIndex,
    onIndexChange: setHoldIndex,
    stepMs: 820,
    entryLockMs: 1100,
    arrivalIndex: () => PARKED_INDEX,
    consumeWheel: consumeMineWheel,
  });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          setPanelVisible(true);
        }
      },
      { threshold: [0, 0.45, 0.65] },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id={chapter.id}
      data-snap-section
      data-wheel-sequence
      data-wheel-at={
        holdIndex <= 0 ? "start" : holdIndex >= HOLD_STEPS - 1 ? "end" : "mid"
      }
      className={`personal-mine narrative-chapter narrative-chapter--plain min-h-[100svh] scroll-mt-0${switchOn ? " personal-mine--synesthetic" : ""}`}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="personal-mine__layout">
        <div className="personal-mine__copy">
          <p className="narrative-eyebrow m-0 font-body">{chapter.eyebrow}</p>
          <h2 id={`${chapter.id}-title`} className="narrative-title personal-mine__title mt-3 font-display">
            {chapter.title}
          </h2>
          <span className="narrative-chapter__title-rule" aria-hidden="true" />
          {chapter.subtitle ? (
            <p className="narrative-subtitle personal-mine__subtitle mt-3 font-body">{chapter.subtitle}</p>
          ) : null}
          <div className="personal-mine__paragraphs">
            <PersonalMineReading paragraphs={chapter.body} active={switchOn} />
          </div>
          {chapter.sourceKeys && chapter.sourceKeys.length > 0 ? (
            <div className="personal-mine__sources">
              <SourcesDrawer sourceKeys={chapter.sourceKeys} />
            </div>
          ) : null}
        </div>

        <div className="personal-mine__divider" aria-hidden="true" />

        <aside
          className={`personal-mine__panel${panelVisible ? " personal-mine__panel--visible" : ""}${switchOn ? " personal-mine__panel--active" : ""}`}
          aria-label="Interactive reading mode"
        >
          <label className="personal-mine__switch">
            <input
              type="checkbox"
              role="switch"
              checked={switchOn}
              aria-label="Read through my eyes"
              onChange={(event) => setSwitchOn(event.target.checked)}
            />
            <span className="personal-mine__switch-track" aria-hidden="true">
              <span className="personal-mine__switch-thumb" />
            </span>
          </label>
          <div className="personal-mine__panel-copy">
            <p className="personal-mine__panel-line m-0 font-body">Switch it on</p>
            <p className="personal-mine__panel-line m-0 font-body">
              Let your cursor become your gaze.
            </p>
            <p className="personal-mine__panel-line m-0 font-body">Read through my eyes</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
