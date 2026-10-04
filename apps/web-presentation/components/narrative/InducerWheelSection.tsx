"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import { inducerPairImages, type InducerPairImage } from "@/content/inducerPairImages";

import { FilterPreviewSnake } from "./FilterPreviewSnake";
import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type Props = {
  chapter: Chapter;
};

type FramePhoto = {
  key: string;
  src: string;
  slot: number;
  depth: number;
  x: number;
  y: number;
  width: number;
  horizontalEdge: "left" | "right";
  verticalEdge: "top" | "bottom";
};

type Frame = {
  id: string;
  pairIndex: number;
  photos: FramePhoto[];
  phase: "opening" | "opening-transition" | "photos" | "outro";
};

type StagePhoto = FramePhoto & {
  present: boolean;
};

const LOOK_AHEAD = 7;
const PRE_ROLL = 2;
const POST_ROLL = 3;
const PHOTO_LAYOUT_VERSION = 3;
const FILTER_STAGE_BACKGROUND = "#f5f2eb";
const FILTER_WHEEL_STEP_DEG = 360 / (inducerPairImages.length + 1);
const PREVIEW_WHEEL_SCALE = 2600;
const OPENING_COPY =
  "Here is where the senses begin to cross. Each color is a filter, turning something seen into something felt.";

const PHOTO_ANCHORS = [
  { x: 2, y: -18, width: 18, horizontalEdge: "left", verticalEdge: "top" },
  { x: 2, y: -18, width: 18, horizontalEdge: "right", verticalEdge: "top" },
  { x: 4, y: 27, width: 16, horizontalEdge: "right", verticalEdge: "top" },
  { x: 4, y: 27, width: 16, horizontalEdge: "right", verticalEdge: "bottom" },
  { x: 2, y: -18, width: 18, horizontalEdge: "right", verticalEdge: "bottom" },
  { x: 2, y: -18, width: 18, horizontalEdge: "left", verticalEdge: "bottom" },
  { x: 4, y: 27, width: 16, horizontalEdge: "left", verticalEdge: "bottom" },
  { x: 4, y: 27, width: 16, horizontalEdge: "left", verticalEdge: "top" },
] as const;

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Stable, slightly irregular placement around the central copy. */
function placementFor(pairIndex: number, photoIndex: number) {
  // Three- and five-slot jumps keep consecutive depth layers in separate
  // quadrants. A one-slot-equivalent jump (such as 7 on eight anchors) causes
  // the visible photos to bunch together along the same side.
  const steps = [3, 5] as const;
  const step = steps[pairIndex % steps.length] ?? 3;
  const offset = (pairIndex * 7 + 3) % PHOTO_ANCHORS.length;
  const anchorIndex = (offset + photoIndex * step) % PHOTO_ANCHORS.length;
  const anchor = PHOTO_ANCHORS[anchorIndex] ?? PHOTO_ANCHORS[0];
  const seed = pairIndex * 97 + photoIndex * 17 + 11;
  const horizontalJitter = seededUnit(seed) * 2.5;
  const verticalJitter =
    anchor.verticalEdge === "top" && anchor.y > 20
      ? (seededUnit(seed + 1) - 0.5) * 6
      : seededUnit(seed + 1) * 3;
  return {
    slot: anchorIndex,
    x: anchor.x + horizontalJitter,
    y: anchor.y + verticalJitter,
    width: anchor.width + (seededUnit(seed + 2) - 0.5) * 3,
    horizontalEdge: anchor.horizontalEdge,
    verticalEdge: anchor.verticalEdge,
  };
}

function titleFor(item: InducerPairImage): string {
  return `${item.colorLabel} / ${item.emotionLabel}`;
}

function hexLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return 0;
  const channel = (start: number) => {
    const value = Number.parseInt(raw.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function navTone(hex: string): "on-dark" | "on-light" {
  return hexLuminance(hex) > 0.42 ? "on-light" : "on-dark";
}

/**
 * Each scroll advances one photograph through depth:
 * distant + blurred → clear → enlarged + blurred as it passes the viewer.
 */
function buildFrames(images: InducerPairImage[]): Frame[] {
  const frames: Frame[] = [
    { id: "opening", pairIndex: 0, photos: [], phase: "opening" },
    {
      id: "opening-transition",
      pairIndex: 0,
      photos: [],
      phase: "opening-transition",
    },
  ];
  images.forEach((item, pairIndex) => {
    const count = item.photos.length;
    for (let focus = -PRE_ROLL; focus < count + POST_ROLL; focus += 1) {
      frames.push({
        id: `${item.colorLabel}-${focus}`,
        pairIndex,
        phase: "photos",
        // Keep the whole color set mounted so each image travels forward from
        // deep space instead of being inserted when it becomes visible.
        photos: item.photos.map((src, index) => {
          const placement = placementFor(pairIndex, index);
          return {
            key: `${pairIndex}-${index}`,
            src,
            ...placement,
            depth: index - focus,
          };
        }),
      });
    }
    frames.push({
      id: `${item.colorLabel}-outro`,
      pairIndex,
      photos: [],
      phase: "outro",
    });
  });
  return frames;
}

function useMountedPhotos(photos: FramePhoto[]) {
  const signature = photos
    .map(
      (photo) =>
        `${photo.key}:${photo.depth}:${photo.slot}:${photo.x}:${photo.y}:${photo.horizontalEdge}:${photo.verticalEdge}`,
    )
    .join("|");
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [mounted, setMounted] = useState<StagePhoto[]>([]);

  useLayoutEffect(() => {
    const active = photosRef.current;
    const keys = new Set(active.map((photo) => photo.key));
    setMounted((current) => {
      const next: StagePhoto[] = [];
      const seen = new Set<string>();
      for (const photo of current) {
        seen.add(photo.key);
        const activePhoto = active.find((candidate) => candidate.key === photo.key);
        if (activePhoto) next.push({ ...activePhoto, present: photo.present });
        else if (photo.present) next.push({ ...photo, present: false });
      }
      for (const photo of active) {
        if (!seen.has(photo.key)) next.push({ ...photo, present: false });
      }
      return next;
    });
  }, [signature]);

  useEffect(() => {
    const keys = new Set(photosRef.current.map((photo) => photo.key));
    let revealFrame = 0;
    const layoutFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        setMounted((current) =>
          current.map((photo) => (keys.has(photo.key) ? { ...photo, present: true } : photo)),
        );
      });
    });
    const drop = window.setTimeout(() => {
      setMounted((current) => current.filter((photo) => keys.has(photo.key)));
    }, 980);
    return () => {
      cancelAnimationFrame(layoutFrame);
      cancelAnimationFrame(revealFrame);
      window.clearTimeout(drop);
    };
  }, [signature]);

  return mounted;
}

export function InducerWheelSection({ chapter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => buildFrames(inducerPairImages), [PHOTO_LAYOUT_VERSION]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [stageVisible, setStageVisible] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const activeIndexRef = useRef(activeIndex);
  const previewProgressRef = useRef(0);
  const wasIntersectingRef = useRef(false);
  activeIndexRef.current = activeIndex;
  previewProgressRef.current = previewProgress;
  const maxIndex = Math.max(0, frames.length - 1);
  const frame = frames[activeIndex] ?? frames[0];
  const pair = frame ? inducerPairImages[frame.pairIndex] : undefined;
  const nextPair = frame ? inducerPairImages[frame.pairIndex + 1] : undefined;
  const photos = useMountedPhotos(frame?.photos ?? []);

  const setFrameIndex = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(maxIndex, index));
      if (nextIndex !== activeIndexRef.current) {
        const nextFrame = frames[nextIndex];
        const prevFrame = frames[activeIndexRef.current];
        if (nextFrame?.phase === "opening" && prevFrame?.phase !== "opening") {
          const rewind = nextIndex < activeIndexRef.current;
          previewProgressRef.current = rewind ? 1 : 0;
          setPreviewProgress(rewind ? 1 : 0);
        }
        setDirection(nextIndex > activeIndexRef.current ? 1 : -1);
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
    },
    [frames, maxIndex],
  );

  const consumeOpeningWheel = useCallback(
    (index: number, event: WheelEvent) => {
      if (frames[index]?.phase !== "opening") return false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

      const prev = previewProgressRef.current;
      if (event.deltaY > 0 && prev >= 1) return false;
      if (event.deltaY < 0 && prev <= 0) return false;

      const next = Math.min(1, Math.max(0, prev + event.deltaY / PREVIEW_WHEEL_SCALE));
      previewProgressRef.current = next;
      setPreviewProgress(next);
      return true;
    },
    [frames],
  );

  useSnapSectionWheelSequence({
    rootRef,
    itemCount: frames.length,
    activeIndex,
    onIndexChange: setFrameIndex,
    stepMs: 280,
    entryLockMs: 480,
    consumeWheel: consumeOpeningWheel,
    stepMsForIndex: (index) =>
      frames[index]?.phase === "opening-transition"
        ? 2100
        : frames[index]?.phase === "outro"
          ? 1300
          : frames[index]?.phase === "photos" &&
              frames[index]?.photos.every((photo) => photo.depth >= 2)
            ? 220
            : 280,
  });

  useEffect(() => {
    const stage = rootRef.current;
    if (!stage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const isIntersecting = entry.isIntersecting;

        if (isIntersecting && !wasIntersectingRef.current) {
          const fromTop = entry.boundingClientRect.top >= 0;
          previewProgressRef.current = fromTop ? 0 : 1;
          setPreviewProgress(fromTop ? 0 : 1);
          setFrameIndex(fromTop ? 0 : maxIndex);
        }

        wasIntersectingRef.current = isIntersecting;
        setStageVisible(isIntersecting && entry.intersectionRatio >= 0.28);
      },
      { threshold: [0.01, 0.28] },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [maxIndex, setFrameIndex]);

  useEffect(() => {
    inducerPairImages.forEach((item) => {
      item.photos.forEach((src) => {
        const image = new window.Image();
        image.src = src;
      });
    });
  }, []);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const opening = frames[activeIndex]?.phase === "opening";
    if (opening && (event.key === "ArrowDown" || event.key === "ArrowRight")) {
      event.preventDefault();
      if (previewProgressRef.current >= 1) {
        setFrameIndex(Math.min(maxIndex, activeIndex + 1));
        return;
      }
      const next = Math.min(1, previewProgressRef.current + 0.08);
      previewProgressRef.current = next;
      setPreviewProgress(next);
      return;
    }
    if (opening && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
      event.preventDefault();
      if (previewProgressRef.current <= 0) {
        setFrameIndex(Math.max(0, activeIndex - 1));
        return;
      }
      const next = Math.max(0, previewProgressRef.current - 0.08);
      previewProgressRef.current = next;
      setPreviewProgress(next);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setFrameIndex(Math.min(maxIndex, activeIndex + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setFrameIndex(Math.max(0, activeIndex - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setFrameIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setFrameIndex(maxIndex);
    }
  };

  if (!frame || !pair) return null;

  const isOpening = frame.phase === "opening";
  const isOpeningTransition = frame.phase === "opening-transition";
  const isOpeningState = isOpening || isOpeningTransition;
  const isWheelStep = frame.phase === "outro" || isOpeningTransition;
  const isFinalOutro =
    frame.phase === "outro" && frame.pairIndex === inducerPairImages.length - 1;
  const isPhotoHandoff =
    frame.phase === "photos" &&
    frame.photos.length > 0 &&
    (frame.photos.every((photo) => photo.depth >= 2) ||
      frame.photos.every((photo) => photo.depth < -2));
  const currentWheelIndex =
    isOpening || isOpeningTransition ? 0 : frame.pairIndex + 1;
  const boundaryStart = currentWheelIndex * FILTER_WHEEL_STEP_DEG;
  const boundaryEnd = (currentWheelIndex + 1) * FILTER_WHEEL_STEP_DEG;
  const wheelFrom =
    isWheelStep && direction < 0 ? boundaryEnd : boundaryStart;
  const wheelTo = isWheelStep
    ? direction > 0
      ? boundaryEnd
      : boundaryStart
    : boundaryStart;
  const wheelDelta = wheelTo - wheelFrom;
  const transitionPair = isOpeningTransition
    ? pair
    : direction > 0
      ? nextPair
      : pair;
  const outgoingPair = isOpeningTransition
    ? undefined
    : direction > 0
      ? pair
      : nextPair;
  const apertureFrom = isOpeningTransition
    ? direction > 0
      ? -FILTER_WHEEL_STEP_DEG
      : 0
    : direction > 0
      ? -FILTER_WHEEL_STEP_DEG
      : FILTER_WHEEL_STEP_DEG;
  const apertureTo = isOpeningTransition
    ? direction > 0
      ? 0
      : -FILTER_WHEEL_STEP_DEG
    : 0;
  const apertureDelta = apertureTo - apertureFrom;
  const outgoingApertureTo =
    direction > 0 ? FILTER_WHEEL_STEP_DEG : -FILTER_WHEEL_STEP_DEG;

  return (
    <section
      id={chapter.id}
      data-snap-section
      data-nav={isOpeningState ? "on-light" : navTone(pair.hex)}
      className="narrative-chapter narrative-chapter--filter-disc min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
      style={
        {
          "--pair-hex": pair.hex,
          "--pair-ink": isOpeningState
            ? "#3f4549"
            : pair.colorLabel === "White"
              ? "#686d72"
              : "#ffffff",
        } as CSSProperties
      }
    >
      <div
        ref={rootRef}
        className={`join-float${stageVisible ? " is-stage-visible" : ""}`}
        data-wheel-sequence
        data-wheel-at={activeIndex <= 0 ? "start" : activeIndex >= maxIndex ? "end" : "mid"}
        tabIndex={0}
        onKeyDown={handleKey}
      >
        {isOpening && stageVisible ? <FilterPreviewSnake progress={previewProgress} /> : null}

        <div
          className={`join-float__filter-wheel${isWheelStep ? " is-stepping" : ""}${isOpeningTransition ? " is-opening-step" : ""}`}
          aria-hidden="true"
          style={
            {
              "--wheel-angle": `${wheelTo}deg`,
              "--wheel-from": `${wheelFrom}deg`,
              "--wheel-ease-out": `${wheelFrom + wheelDelta * 0.08}deg`,
              "--wheel-ease-in": `${wheelFrom + wheelDelta * 0.92}deg`,
              "--wheel-to": `${wheelTo}deg`,
            } as CSSProperties
          }
        >
          {[
            { colorLabel: "Clear", hex: FILTER_STAGE_BACKGROUND },
            ...inducerPairImages,
          ].map((disc, index) => (
            <div
              key={disc.colorLabel}
              className="join-float__disc-slot"
              style={
                {
                  "--disc-slot-angle": `${-index * FILTER_WHEEL_STEP_DEG}deg`,
                  "--disc-color": disc.hex,
                } as CSSProperties
              }
            >
              <div className="join-float__disc" />
            </div>
          ))}
        </div>
        {isWheelStep && outgoingPair ? (
          <div
            className="join-float__transition-copy-mask"
            aria-hidden="true"
            style={
              {
                "--transition-ink":
                  outgoingPair.colorLabel === "White" ? "#686d72" : "#ffffff",
                "--aperture-from": "0deg",
                "--aperture-ease-out": `${outgoingApertureTo * 0.08}deg`,
                "--aperture-ease-in": `${outgoingApertureTo * 0.92}deg`,
                "--aperture-to": `${outgoingApertureTo}deg`,
                "--aperture-counter-from": "0deg",
                "--aperture-counter-ease-out": `${-outgoingApertureTo * 0.08}deg`,
                "--aperture-counter-ease-in": `${-outgoingApertureTo * 0.92}deg`,
                "--aperture-counter-to": `${-outgoingApertureTo}deg`,
              } as CSSProperties
            }
          >
            <div className="join-float__transition-copy-counter">
              <div className="join-float__copy join-float__copy--transition is-visible">
                <h3 className="join-float__title m-0">
                  {titleFor(outgoingPair)}
                </h3>
                <div className="join-float__lines">
                  {outgoingPair.lines.map((line) => (
                    <p key={line} className="join-float__line m-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {isWheelStep && (isOpeningTransition || transitionPair) ? (
          <div
            className={`join-float__transition-copy-mask${isOpeningTransition ? " is-opening-transition" : ""}`}
            aria-hidden="true"
            style={
              {
                "--transition-ink":
                  transitionPair?.colorLabel === "White" ? "#686d72" : "#ffffff",
                "--aperture-from": `${apertureFrom}deg`,
                "--aperture-ease-out": `${apertureFrom + apertureDelta * 0.08}deg`,
                "--aperture-ease-in": `${apertureFrom + apertureDelta * 0.92}deg`,
                "--aperture-to": `${apertureTo}deg`,
                "--aperture-counter-from": `${-apertureFrom}deg`,
                "--aperture-counter-ease-out": `${-(apertureFrom + apertureDelta * 0.08)}deg`,
                "--aperture-counter-ease-in": `${-(apertureFrom + apertureDelta * 0.92)}deg`,
                "--aperture-counter-to": `${-apertureTo}deg`,
              } as CSSProperties
            }
          >
            <div className="join-float__transition-copy-counter">
              <div className="join-float__copy join-float__copy--transition is-visible">
                {transitionPair ? (
                  <>
                    <h3 className="join-float__title m-0">
                      {titleFor(transitionPair)}
                    </h3>
                    <div className="join-float__lines">
                      {transitionPair.lines.map((line) => (
                        <p key={line} className="join-float__line m-0">
                          {line}
                        </p>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {isFinalOutro ? (
          <div className="join-float__closing-copy" aria-live="polite">
            <p className="join-float__closing-title m-0">
              What you just felt, artists have long explored.
            </p>
            <p className="join-float__closing-subtitle m-0">
              Here is how six of them gave it form.
            </p>
          </div>
        ) : null}
        <div className="join-float__bloom join-float__bloom--a" aria-hidden="true" />
        <div className="join-float__bloom join-float__bloom--b" aria-hidden="true" />
        <div className="join-float__glass" aria-hidden="true" />

        <div className="join-float__photos" aria-hidden="true">
          {photos.map((photo) => (
            <div
              key={photo.key}
              className={`join-float__frame${photo.horizontalEdge === "right" ? " is-right-anchored" : ""}${photo.verticalEdge === "bottom" ? " is-bottom-anchored" : ""} join-float__frame--depth-${photo.depth < -2 ? "gone" : photo.depth === -2 ? "passed-2" : photo.depth === -1 ? "passed-1" : photo.depth > 2 ? "far" : photo.depth}${photo.present ? " is-in" : ""}`}
              style={
                {
                  "--frame-x": `${photo.x.toFixed(2)}%`,
                  "--frame-y": `${photo.y.toFixed(2)}%`,
                  "--frame-w": `${photo.width.toFixed(2)}vw`,
                  zIndex: photo.depth < 0 ? 10 : 30 - photo.depth,
                } as CSSProperties
              }
            >
              <img src={photo.src} alt="" draggable={false} className="join-float__photo" />
            </div>
          ))}
        </div>

        <div className="join-float__veil" aria-hidden="true" />

        <div
          className={`join-float__copy${isOpeningState || frame.phase === "photos" ? " is-visible" : ""}${isOpeningTransition ? direction > 0 ? " is-opening-copy-leaving" : " is-opening-copy-returning" : ""}${frame.phase === "outro" ? " is-transition-hidden" : ""}${isPhotoHandoff ? " is-transition-handoff" : ""}`}
          aria-live="polite"
        >
          {isOpeningState ? (
            <p
              id={`${chapter.id}-title`}
              className="join-float__opening-copy m-0"
            >
              {OPENING_COPY}
            </p>
          ) : (
            <>
              <h3 id={`${chapter.id}-title`} className="join-float__title m-0">
                {titleFor(pair)}
              </h3>
              <div className="join-float__lines">
                {pair.lines.map((line) => (
                  <p key={line} className="join-float__line m-0">
                    {line}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
