"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { InducerPairImage } from "@/content/inducerPairImages";

type Props = {
  items: InducerPairImage[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

const SPAN_DEG = 180;
const STEP_DEG = SPAN_DEG / 6;

function polarAngleForSlot(slot: number): number {
  return 180 + slot * STEP_DEG;
}

function wrappedSlot(activeIndex: number, itemIndex: number, count: number): number {
  const half = Math.floor((count - 1) / 2);
  let slot = (activeIndex - itemIndex) % count;
  if (slot < 0) slot += count;
  if (slot > half) slot -= count;
  return slot;
}

function initialAngles(count: number, activeIndex: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    polarAngleForSlot(wrappedSlot(activeIndex, index, count)),
  );
}

function rotationSteps(from: number, to: number, count: number): number {
  let delta = to - from;
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return delta;
}

function advanceAngles(
  current: number[],
  fromActive: number,
  toActive: number,
  count: number,
): number[] {
  const steps = rotationSteps(fromActive, toActive, count);
  if (steps === 0) return current;

  const direction = steps > 0 ? 1 : -1;
  const next = [...current];
  let active = fromActive;

  for (let step = 0; step < Math.abs(steps); step += 1) {
    for (let index = 0; index < count; index += 1) {
      const slot = wrappedSlot(active, index, count);
      if (direction === 1 && slot === 3) next[index] += SPAN_DEG;
      else if (direction === -1 && slot === -3) next[index] -= SPAN_DEG;
      else next[index] += direction * STEP_DEG;
    }
    active = (active + direction + count) % count;
  }

  return next;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function isOnHiddenHalf(deg: number): boolean {
  const angle = normalizeDeg(deg);
  return angle < 90 || angle > 270;
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

export function ColorSwatchArc({ items, activeIndex, onSelect }: Props) {
  const count = items.length;
  const prevActiveRef = useRef(activeIndex);
  const [angles, setAngles] = useState(() => initialAngles(count, activeIndex));

  useEffect(() => {
    const previous = prevActiveRef.current;
    if (previous === activeIndex) return;
    setAngles((current) => advanceAngles(current, previous, activeIndex, count));
    prevActiveRef.current = activeIndex;
  }, [activeIndex, count]);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(index);
      return;
    }

    const last = count - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(Math.min(last, index + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      onSelect(Math.max(0, index - 1));
    }
  };

  return (
    <div className="swatch-orbit" aria-label="Color pairs">
      <div className="swatch-orbit__ring" role="listbox" aria-label="Color swatches">
        {items.map((item, index) => {
          const angle = angles[index] ?? polarAngleForSlot(wrappedSlot(activeIndex, index, count));
          const isActive = index === activeIndex;
          const hidden = isOnHiddenHalf(angle);
          const light = isLightHex(item.hex);

          return (
            <button
              key={`${item.hex}-${item.emotionLabel}`}
              type="button"
              role="option"
              tabIndex={hidden ? -1 : 0}
              aria-hidden={hidden || undefined}
              aria-selected={isActive}
              aria-label={`${item.colorLabel}, ${item.emotionLabel}, ${item.hex}`}
              className={`swatch-orbit__swatch${isActive ? " swatch-orbit__swatch--active" : ""}${light ? " swatch-orbit__swatch--light" : ""}`}
              style={{
                transform: `translate(-50%, -50%) rotate(${-angle}deg) translateX(var(--arc-radius)) rotate(${angle}deg)`,
                backgroundColor: item.hex,
                opacity: hidden ? 0 : 1,
              }}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => handleKey(event, index)}
            />
          );
        })}
      </div>

      {items[activeIndex] ? (
        <p
          key={items[activeIndex].emotionLabel}
          className="swatch-orbit__word swatch-orbit__word--active font-body"
          style={{ color: wordColor(items[activeIndex].hex) }}
        >
          {items[activeIndex].emotionLabel}
        </p>
      ) : null}
    </div>
  );
}
