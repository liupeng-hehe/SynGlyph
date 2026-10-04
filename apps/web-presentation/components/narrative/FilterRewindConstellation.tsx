"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { inducerPairImages } from "@/content/inducerPairImages";

function inkFor(hex: string, label: string): string {
  return label === "White" ? "#686d72" : hex;
}

export function FilterRewindConstellation() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = inducerPairImages[activeIndex] ?? inducerPairImages[0];
  const step = 360 / inducerPairImages.length;
  const ink = active ? inkFor(active.hex, active.colorLabel) : "#3f4549";

  const dots = useMemo(
    () =>
      inducerPairImages.map((item, index) => ({
        ...item,
        angle: index * step,
      })),
    [step],
  );

  if (!active) return null;

  return (
    <div
      className="filter-rewind"
      style={{ "--rewind-ink": ink } as CSSProperties}
    >
      <div className="filter-rewind__copy" aria-live="polite">
        <h3 className="join-float__title m-0">
          {active.colorLabel} / {active.emotionLabel}
        </h3>
        <div className="join-float__lines">
          {active.lines.map((line) => (
            <p key={line} className="join-float__line m-0">
              {line}
            </p>
          ))}
        </div>
      </div>
      <ul className="filter-rewind__ring" aria-label="Color filters">
        {dots.map((item, index) => (
          <li
            key={item.colorLabel}
            className="filter-rewind__slot"
            style={
              {
                "--dot-angle": `${item.angle}deg`,
                "--dot-hex": item.hex,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className={`filter-rewind__dot${index === activeIndex ? " is-active" : ""}`}
              aria-label={`${item.colorLabel} / ${item.emotionLabel}`}
              aria-pressed={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
