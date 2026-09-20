"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import {
  inducerPairImages,
  type InducerPairImage,
} from "@/content/inducerPairImages";

import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type Props = {
  chapter: Chapter;
};

function titleFor(item: InducerPairImage): string {
  return `${item.colorLabel} / ${item.emotionLabel}`;
}

function isLightHex(hex: string): boolean {
  const value = hex.replace("#", "").padStart(6, "0");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const toLin = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b) > 0.72;
}

export function InducerWheelSection({ chapter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const maxIndex = inducerPairImages.length - 1;
  const pairImage = inducerPairImages[activeIndex] ?? inducerPairImages[0];

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
      className="narrative-chapter narrative-chapter--pair-wheel min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div
        ref={rootRef}
        className="pair-wheel pair-wheel--filmstrip"
        data-wheel-sequence
        data-wheel-at={activeIndex <= 0 ? "start" : activeIndex >= maxIndex ? "end" : "mid"}
      >
        <header className="pair-wheel__header">
          <p className="pair-wheel__eyebrow m-0 font-body">{chapter.eyebrow}</p>
          <h3 id={`${chapter.id}-title`} className="pair-wheel__heading m-0 font-body">
            Inducer / Concurrent
          </h3>
          <p className="pair-wheel__sub m-0 font-body">
            Select a pairing — or scroll — to switch the color
          </p>
        </header>

        <div
          className="pair-filmstrip"
          role="listbox"
          aria-label="Color pairs"
          tabIndex={0}
          onKeyDown={handleKey}
        >
          {inducerPairImages.map((item, index) => {
            const active = index === activeIndex;
            const distant = Math.abs(index - activeIndex) > 2;
            const light = isLightHex(item.hex);
            const ink = light ? "#5c6168" : item.hex;

            return (
              <button
                key={`${item.hex}-${item.emotionLabel}`}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={titleFor(item)}
                className={`pair-filmstrip__strip${active ? " pair-filmstrip__strip--active" : ""}${distant ? " pair-filmstrip__strip--distant" : ""}`}
                onClick={() => setPairIndex(index)}
              >
                <span className="pair-filmstrip__media">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 860px) 52vw, 440px"
                    className="pair-filmstrip__image"
                    priority={index === 0}
                    draggable={false}
                  />
                </span>
                {active ? (
                  <span className="pair-filmstrip__copy font-body" style={{ color: ink }}>
                    <span className="pair-filmstrip__title">{titleFor(item)}</span>
                    {item.lines.map((line) => (
                      <span key={line} className="pair-filmstrip__line">
                        {line}
                      </span>
                    ))}
                    <span className="pair-filmstrip__hex">{item.hex}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
