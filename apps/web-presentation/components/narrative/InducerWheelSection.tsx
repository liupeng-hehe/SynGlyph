"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import { inducerPairImages } from "@/content/inducerPairImages";

import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type Props = {
  chapter: Chapter;
};

function titleFor(item: (typeof inducerPairImages)[number]): string {
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

/** Dark HEX stays the same hue but readable on the black stage. */
function copyInkOnBlack(hex: string): string {
  return hexLuminance(hex) < 0.28 ? mixHex(hex, "#ffffff", 0.42) : hex;
}

/** Layout placeholder until the new color photographs arrive. */
const LAYOUT_IMAGE = inducerPairImages[0]?.src ?? "/collab/page2/asset-1.png";

export function InducerWheelSection({ chapter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const maxIndex = inducerPairImages.length - 1;
  const pairImage = inducerPairImages[activeIndex] ?? inducerPairImages[0];
  const step = 360 / Math.max(inducerPairImages.length, 1);

  const setPairIndex = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(maxIndex, index)));
    },
    [maxIndex],
  );

  useSnapSectionWheelSequence({
    rootRef,
    itemCount: inducerPairImages.length,
    activeIndex,
    onIndexChange: setPairIndex,
    stepMs: 900,
  });

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = maxIndex;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setPairIndex(Math.min(last, activeIndex + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setPairIndex(Math.max(0, activeIndex - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setPairIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setPairIndex(last);
    }
  };

  if (inducerPairImages.length === 0 || !pairImage) return null;

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="narrative-chapter narrative-chapter--filter-disc min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div
        ref={rootRef}
        className="filter-disc"
        data-wheel-sequence
        data-wheel-at={activeIndex <= 0 ? "start" : activeIndex >= maxIndex ? "end" : "mid"}
        role="listbox"
        aria-label="Color pairs"
        tabIndex={0}
        onKeyDown={handleKey}
        style={
          {
            "--disc-rot": `${(-activeIndex * step).toFixed(3)}deg`,
            "--pair-hex": pairImage.hex,
            "--pair-ink": copyInkOnBlack(pairImage.hex),
          } as CSSProperties
        }
      >
        <div className="filter-disc__aperture">
          <div className="filter-disc__rotor">
            <div className="filter-disc__plate">
              <Image
                src={LAYOUT_IMAGE}
                alt=""
                fill
                sizes="100vh"
                className="filter-disc__image"
                priority
                draggable={false}
              />
              <span className="filter-disc__gel" aria-hidden="true" />
            </div>
            {inducerPairImages.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={`${item.hex}-${item.emotionLabel}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={titleFor(item)}
                  className={`filter-disc__tick${active ? " filter-disc__tick--active" : ""}`}
                  style={
                    {
                      "--tick-a": `${(index * step).toFixed(3)}deg`,
                      backgroundColor: item.hex,
                    } as CSSProperties
                  }
                  onClick={() => setPairIndex(index)}
                />
              );
            })}
          </div>
        </div>

        <div className="filter-disc__copy">
          <h3 id={`${chapter.id}-title`} className="filter-disc__title m-0 font-prose">
            {titleFor(pairImage)}
          </h3>
          {pairImage.lines.map((line) => (
            <p key={line} className="filter-disc__line m-0 font-body">
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
