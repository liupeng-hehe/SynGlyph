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
  ratio: number;
};

type Frame = {
  id: string;
  pairIndex: number;
  photos: FramePhoto[];
};

type StagePhoto = FramePhoto & {
  present: boolean;
};

const LOOK_AHEAD = 4;

const PHOTO_ANCHORS = [
  { x: -2, y: -5, width: 20, ratio: 0.84 },
  { x: 79, y: 13, width: 21, ratio: 0.72 },
  { x: 9, y: 25, width: 16, ratio: 0.82 },
  { x: 13, y: 67, width: 15, ratio: 0.86 },
  { x: 69, y: -5, width: 16, ratio: 1.12 },
  { x: 79, y: 46, width: 15, ratio: 0.8 },
  { x: 42, y: 75, width: 14, ratio: 1.05 },
  { x: 2, y: 51, width: 15, ratio: 0.78 },
] as const;

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Stable, slightly irregular placement around the central copy. */
function placementFor(pairIndex: number, photoIndex: number) {
  const slot = photoIndex % PHOTO_ANCHORS.length;
  const anchor = PHOTO_ANCHORS[slot] ?? PHOTO_ANCHORS[0];
  const seed = pairIndex * 97 + photoIndex * 17 + 11;
  return {
    slot,
    x: anchor.x + (seededUnit(seed) - 0.5) * 7,
    y: anchor.y + (seededUnit(seed + 1) - 0.5) * 7,
    width: anchor.width + (seededUnit(seed + 2) - 0.5) * 3.5,
    ratio: anchor.ratio + (seededUnit(seed + 3) - 0.5) * 0.12,
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

function mixHex(hex: string, onto: string, amount: number): string {
  const parse = (value: string) => {
    const raw = value.replace("#", "");
    return [0, 2, 4].map((start) => Number.parseInt(raw.slice(start, start + 2), 16));
  };
  const from = parse(hex);
  const to = parse(onto);
  const mixed = from.map((channel, index) =>
    Math.round(channel + ((to[index] ?? 0) - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Frosted wash of the swatch. Light glass gets dark type; deep glass gets light type. */
function inkFor(hex: string): string {
  const glazed = mixHex(hex, "#ffffff", 0.28);
  return hexLuminance(glazed) > 0.5 ? "#241c16" : "#f6f1e8";
}

function navTone(hex: string): "on-dark" | "on-light" {
  return inkFor(hex) === "#241c16" ? "on-light" : "on-dark";
}

/**
 * Each scroll advances one photograph through depth:
 * distant + blurred → clear → enlarged + blurred as it passes the viewer.
 */
function buildFrames(images: InducerPairImage[]): Frame[] {
  const frames: Frame[] = [];
  images.forEach((item, pairIndex) => {
    const count = item.photos.length;
    for (let focus = 0; focus < count; focus += 1) {
      const first = Math.max(0, focus - 1);
      const last = Math.min(count - 1, focus + LOOK_AHEAD);
      frames.push({
        id: `${item.colorLabel}-${focus}`,
        pairIndex,
        photos: item.photos.slice(first, last + 1).map((src, offset) => {
          const index = first + offset;
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
  const signature = photos.map((photo) => `${photo.key}:${photo.depth}`).join("|");
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
    const frame = requestAnimationFrame(() => {
      setMounted((current) =>
        current.map((photo) => (keys.has(photo.key) ? { ...photo, present: true } : photo)),
      );
    });
    const drop = window.setTimeout(() => {
      setMounted((current) => current.filter((photo) => keys.has(photo.key)));
    }, 980);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(drop);
    };
  }, [signature]);

  return mounted;
}

export function InducerWheelSection({ chapter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => buildFrames(inducerPairImages), []);
  const [activeIndex, setActiveIndex] = useState(0);
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
    stepMs: 860,
  });

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

  const ink = inkFor(pair.hex);

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
          "--pair-ink": ink,
        } as CSSProperties
      }
    >
      <div
        ref={rootRef}
        className="join-float"
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
              className={`join-float__frame join-float__frame--${photo.slot} join-float__frame--depth-${photo.depth < 0 ? "passed" : photo.depth}${photo.present ? " is-in" : ""}`}
              style={
                {
                  "--frame-x": `${photo.x.toFixed(2)}%`,
                  "--frame-y": `${photo.y.toFixed(2)}%`,
                  "--frame-w": `${photo.width.toFixed(2)}vw`,
                  "--frame-ratio": photo.ratio.toFixed(3),
                  transitionDelay: photo.present
                    ? `${Math.max(0, photo.depth) * 24}ms`
                    : "0ms",
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
          {pair.lines.map((line) => (
            <p key={line} className="join-float__line m-0 font-body">
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
