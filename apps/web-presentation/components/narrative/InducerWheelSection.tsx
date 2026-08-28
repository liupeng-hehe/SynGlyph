"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import { inducerPairImages } from "@/content/inducerPairImages";

import { SemicircleArcWheel } from "./SemicircleArcWheel";
import { SourcesDrawer } from "./SourcesDrawer";
import { useSnapSectionWheelSequence } from "./useSnapSectionWheelSequence";

type Props = {
  chapter: Chapter;
};

function initialIndex(): number {
  return 0;
}

function PairImagePanel({
  imageSrc,
  imageAlt,
  animating,
}: {
  imageSrc: string;
  imageAlt: string;
  animating: boolean;
}) {
  return (
    <article
      className={`pair-image-card${animating ? " pair-image-card--animating" : ""}`}
      aria-hidden="true"
    >
      <div className="pair-image-card__media pair-image-card__media--full">
        <Image
          key={imageSrc}
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(max-width: 960px) 94vw, 520px"
          className="pair-image-card__image"
          priority
        />
      </div>
    </article>
  );
}

export function InducerWheelSection({ chapter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [animating, setAnimating] = useState(false);

  const maxIndex = inducerPairImages.length - 1;
  const pairImage = inducerPairImages[activeIndex] ?? inducerPairImages[0];

  const leftItems = useMemo(
    () =>
      inducerPairImages.map((image, index) => ({
        id: `color-${index}`,
        label: image.colorLabel,
      })),
    [],
  );

  const rightItems = useMemo(
    () =>
      inducerPairImages.map((image, index) => ({
        id: `emotion-${index}`,
        label: image.emotionLabel,
      })),
    [],
  );

  const pulseAnimation = useCallback(() => {
    setAnimating(true);
    window.setTimeout(() => setAnimating(false), 440);
  }, []);

  const setPairIndex = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(maxIndex, index)));
      pulseAnimation();
    },
    [maxIndex, pulseAnimation],
  );

  useSnapSectionWheelSequence({
    rootRef,
    itemCount: inducerPairImages.length,
    activeIndex,
    onIndexChange: setPairIndex,
  });

  if (inducerPairImages.length === 0) return null;

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="narrative-chapter narrative-chapter--pair-wheel min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div
        ref={rootRef}
        className="pair-wheel"
        data-wheel-sequence
        data-wheel-at={activeIndex <= 0 ? "start" : activeIndex >= maxIndex ? "end" : "mid"}
      >
        <header className="pair-wheel__header">
          <p className="pair-wheel__eyebrow m-0 font-body">{chapter.eyebrow}</p>
          <h3 id={`${chapter.id}-title`} className="pair-wheel__heading m-0 font-body">
            Inducer / Concurrent
          </h3>
          <p className="pair-wheel__sub m-0 font-body">
            Two clockwise wheels meet — scroll to switch the pairing image
          </p>
        </header>

        <div className="pair-wheel__stage">
          <aside className="pair-wheel__intro m-0 font-body">
            Color has long carried emotion, while artists have explored where the senses meet.
          </aside>

          <SemicircleArcWheel
            items={leftItems}
            activeIndex={activeIndex}
            side="left"
            animating={animating}
            ariaLabel="Color wheel"
            imageLabels
            hideTracks
            onSelect={setPairIndex}
          />

          <PairImagePanel
            imageSrc={pairImage.src}
            imageAlt={pairImage.alt}
            animating={animating}
          />

          <SemicircleArcWheel
            items={rightItems}
            activeIndex={activeIndex}
            side="right"
            animating={animating}
            ariaLabel="Emotion wheel"
            imageLabels
            hideTracks
            onSelect={setPairIndex}
          />
        </div>

        <footer className="pair-wheel__footer">
          <span className="pair-wheel__footer-label font-body">Colors</span>
          <span className="pair-wheel__footer-scroll font-body">Scroll to pair</span>
          <span className="pair-wheel__footer-label font-body">Emotions</span>
        </footer>

        <div className="pair-wheel__sources">
          <SourcesDrawer sourceKeys={chapter.sourceKeys} />
        </div>
      </div>
    </section>
  );
}
