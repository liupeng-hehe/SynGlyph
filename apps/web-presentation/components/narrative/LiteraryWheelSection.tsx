"use client";

import { useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";
import { senseExamples } from "@/content/senseExamples";

import { SourcesDrawer } from "./SourcesDrawer";
import { VerticalFocusWheel } from "./VerticalFocusWheel";

type Props = {
  chapter: Chapter;
};

function senseColor(label: string): string {
  const s = label.toLowerCase();
  if (s.includes("absence")) return "#9aa6c2";
  if (s.includes("pain")) return "#d97066";
  if (s.includes("touch")) return "#3fb0a3";
  if (s.includes("temperature")) return "#e0a85c";
  if (s.includes("taste")) return "#e98a86";
  if (s.includes("vision")) return "#4f86d6";
  if (s.includes("sound")) return "#8c7ad6";
  if (s.includes("language")) return "#cf86b0";
  return "#3a3f72";
}

export function LiteraryWheelSection({ chapter }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = senseExamples[activeIndex];

  const wheelItems = senseExamples.map((example, index) => ({
    id: `sense-${index}`,
    label: example.phrase,
  }));

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="narrative-chapter narrative-chapter--wheel narrative-chapter--plain min-h-[100svh] scroll-mt-0 px-6 py-16 md:px-10 md:py-20"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="narrative-chapter--wheel__inner mx-auto max-w-6xl">
        <VerticalFocusWheel
          items={wheelItems}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          ariaLabel="Literary synesthesia phrases"
          detail={
            active ? (
              <div className="focus-wheel-detail">
                <p className="narrative-eyebrow m-0 font-body">{chapter.eyebrow}</p>
                <h2
                  id={`${chapter.id}-title`}
                  className="focus-wheel-detail__title mt-3 font-display"
                >
                  {active.phrase}
                </h2>
                <span className="focus-wheel-detail__rule" aria-hidden="true" />
                <p className="focus-wheel-detail__bridge mt-4 font-body text-sm">
                  <span style={{ color: senseColor(active.from) }}>
                    {active.from}
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span style={{ color: senseColor(active.to) }}>{active.to}</span>
                </p>
                <p className="focus-wheel-detail__body mt-5 font-body">
                  {active.explanation}
                </p>
                <p className="focus-wheel-detail__chapter-body mt-6 font-body text-sm">
                  {chapter.body[0]}
                </p>
                <div className="mt-8">
                  <SourcesDrawer sourceKeys={chapter.sourceKeys} />
                </div>
                <p className="focus-wheel-detail__hint m-0 mt-6 font-body text-xs">
                  Scroll inside this section to move through phrases
                </p>
              </div>
            ) : null
          }
        />
      </div>
    </section>
  );
}
