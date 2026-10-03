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
};

type StagePhoto = FramePhoto & {
  present: boolean;
};

const LOOK_AHEAD = 7;
const PRE_ROLL = 3;
const PHOTO_LAYOUT_VERSION = 3;

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
  const frames: Frame[] = [];
  images.forEach((item, pairIndex) => {
    const count = item.photos.length;
    for (let focus = -PRE_ROLL; focus < count; focus += 1) {
      frames.push({
        id: `${item.colorLabel}-${focus}`,
        pairIndex,
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
  const [stageVisible, setStageVisible] = useState(false);
  const maxIndex = Math.max(0, frames.length - 1);
  const frame = frames[activeIndex] ?? frames[0];
  const pair = frame ? inducerPairImages[frame.pairIndex] : undefined;
  const photos = useMountedPhotos(frame?.photos ?? []);

  const setFrameIndex = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(maxIndex, index)));
    },
    [maxIndex],
  );

  useSnapSectionWheelSequence({
    rootRef,
    itemCount: frames.length,
    activeIndex,
    onIndexChange: setFrameIndex,
    stepMs: 220,
  });

  useEffect(() => {
    const stage = rootRef.current;
    if (!stage) return;

    const observer = new IntersectionObserver(
      ([entry]) => setStageVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.28 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    inducerPairImages.forEach((item) => {
      item.photos.forEach((src) => {
        const image = new window.Image();
        image.src = src;
      });
    });
  }, []);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <section
      id={chapter.id}
      data-snap-section
      data-nav={navTone(pair.hex)}
      className="narrative-chapter narrative-chapter--filter-disc min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
      style={
        {
          "--pair-hex": pair.hex,
          "--pair-ink": pair.colorLabel === "White" ? "#686d72" : "#ffffff",
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
                  transitionDelay: photo.present
                    ? `${Math.max(0, photo.depth) * 24}ms`
                    : "0ms",
                  zIndex: photo.depth < 0 ? 10 : 30 - photo.depth,
                } as CSSProperties
              }
            >
              <img src={photo.src} alt="" draggable={false} className="join-float__photo" />
            </div>
          ))}
        </div>

        <div className="join-float__veil" aria-hidden="true" />

        <div key={pair.colorLabel} className="join-float__copy" aria-live="polite">
          <h3 id={`${chapter.id}-title`} className="join-float__title m-0 font-prose">
            {titleFor(pair)}
          </h3>
          <div className="join-float__lines">
            {pair.lines.map((line) => (
              <p key={line} className="join-float__line m-0 font-body">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
