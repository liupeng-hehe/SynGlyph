"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { InducerPairImage } from "@/content/inducerPairImages";

type Props = {
  items: InducerPairImage[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

const SPAN_DEG = 180;
/** 4th of 8 equal slots from +90° (top) to −90° (bottom). */
const HOME_FROM_TOP = 3;

function visualCount(realCount: number): number {
  return realCount + 1;
}

function stepDeg(realCount: number): number {
  return SPAN_DEG / (visualCount(realCount) - 1);
}

/** True `)` : slot 0 = +90°, last slot = −90°. */
function restAngle(slotFromTop: number, realCount: number): number {
  return 90 - slotFromTop * stepDeg(realCount);
}

/**
 * Next color sits above the active swatch; the ghost sits between purple and red.
 * Slot increases toward the bottom.
 */
function slotFromTop(visualActive: number, visualIndex: number, count: number): number {
  const delta = (visualActive - visualIndex + count) % count;
  return (HOME_FROM_TOP + delta) % count;
}

function restAngles(realCount: number, activeIndex: number): number[] {
  const count = visualCount(realCount);
  return Array.from({ length: count }, (_, index) =>
    restAngle(slotFromTop(activeIndex, index, count), realCount),
  );
}

function rotationSteps(from: number, to: number, count: number): number {
  let delta = to - from;
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return delta;
}

function visualDelta(from: number, to: number, realCount: number): number {
  const realDelta = rotationSteps(from, to, realCount);
  if (realDelta > 0) {
    return realDelta + (from + realDelta >= realCount ? 1 : 0);
  }
  if (realDelta < 0) {
    return realDelta - (from + realDelta < 0 ? 1 : 0);
  }
  return 0;
}

/**
 * Next color moves swatches down (angle decreases). Prev moves them up.
 * The short arc is the visible `)`; the long way is the hidden left opening.
 */
function directedTarget(current: number, rest: number, angleDirection: number): number {
  let target = rest;
  while (target - current > 180) target -= 360;
  while (current - target > 180) target += 360;

  if (angleDirection < 0 && target > current) target -= 360;
  if (angleDirection > 0 && target < current) target += 360;
  return target;
}

function advanceAngles(
  current: number[],
  fromActive: number,
  toActive: number,
  realCount: number,
): number[] {
  const steps = visualDelta(fromActive, toActive, realCount);
  if (steps === 0) return restAngles(realCount, toActive);

  const count = visualCount(realCount);
  const angleDirection = steps > 0 ? -1 : 1;
  const targets = restAngles(realCount, toActive);

  return current.map((cur, index) =>
    directedTarget(cur, targets[index] ?? restAngle(slotFromTop(toActive, index, count), realCount), angleDirection),
  );
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function isWrappingBehind(deg: number): boolean {
  const angle = normalizeDeg(deg);
  return angle > 91 && angle < 269;
}

function isLightHex(hex: string): boolean {
  const value = hex.replace("#", "").padStart(6, "0");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const toLin = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return luminance > 0.72;
}

function wordColor(hex: string): string {
  return isLightHex(hex) ? "#8b929a" : hex;
}

function swatchTransform(angle: number): string {
  return `translate(-50%, -50%) rotate(${-angle}deg) translateX(var(--arc-radius)) rotate(${angle}deg)`;
}

export function ColorSwatchArc({ items, activeIndex, onSelect }: Props) {
  const realCount = items.length;
  const count = visualCount(realCount);
  const prevActiveRef = useRef(activeIndex);
  const [angles, setAngles] = useState(() => restAngles(realCount, activeIndex));

  useEffect(() => {
    const previous = prevActiveRef.current;
    if (previous === activeIndex) {
      setAngles(restAngles(realCount, activeIndex));
      return;
    }
    setAngles((current) => advanceAngles(current, previous, activeIndex, realCount));
    prevActiveRef.current = activeIndex;
  }, [activeIndex, realCount]);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(index);
      return;
    }

    const last = realCount - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(Math.min(last, index + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      onSelect(Math.max(0, index - 1));
    }
  };

  const active = items[activeIndex];
  const displayAngles = angles.length === count ? angles : restAngles(realCount, activeIndex);
  const ghostAngle = displayAngles[realCount] ?? restAngle(slotFromTop(activeIndex, realCount, count), realCount);

  return (
    <div className="swatch-orbit" aria-label="Color pairs">
      <div className="swatch-orbit__ring" role="listbox" aria-label="Color swatches">
        {items.map((item, index) => {
          const angle = displayAngles[index] ?? restAngle(slotFromTop(activeIndex, index, count), realCount);
          const isActive = index === activeIndex;
          const behind = isWrappingBehind(angle);
          const light = isLightHex(item.hex);

          return (
            <button
              key={`${item.hex}-${item.emotionLabel}`}
              type="button"
              role="option"
              tabIndex={behind ? -1 : 0}
              aria-hidden={behind || undefined}
              aria-selected={isActive}
              aria-label={`${item.colorLabel}, ${item.emotionLabel}, ${item.hex}`}
              className={`swatch-orbit__swatch${isActive ? " swatch-orbit__swatch--active" : ""}${light ? " swatch-orbit__swatch--light" : ""}`}
              style={{
                transform: swatchTransform(angle),
                backgroundColor: item.hex,
                opacity: behind ? 0 : 1,
                pointerEvents: behind ? "none" : "auto",
              }}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => handleKey(event, index)}
            />
          );
        })}

        <span
          aria-hidden="true"
          className="swatch-orbit__swatch swatch-orbit__swatch--ghost"
          style={{
            transform: swatchTransform(ghostAngle),
            opacity: isWrappingBehind(ghostAngle) ? 0 : 1,
          }}
        />

      </div>

      {active ? (
        <p
          key={active.emotionLabel}
          className="swatch-orbit__word swatch-orbit__word--active font-body"
          style={{ color: wordColor(active.hex) }}
        >
          {active.emotionLabel}
        </p>
      ) : null}
    </div>
  );
}
