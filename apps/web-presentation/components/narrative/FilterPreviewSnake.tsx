"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { inducerPairImages } from "@/content/inducerPairImages";

const LINE_DOT = 11;
const RING_DOT = 44;
const LOOP_RADIUS_RATIO = 0.155;
const CIRCLE_TURNS = 1.5;

type Sample = {
  x: number;
  y: number;
  s: number;
  kind: "line" | "circle";
};

type Bead = {
  x: number;
  y: number;
  size: number;
  color: string;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function buildPath(width: number, height: number): Sample[] {
  const cx = width / 2;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * LOOP_RADIUS_RATIO;
  const samples: Array<Omit<Sample, "s">> = [];

  const entryFrom = -height * 0.28;
  const entryTo = cy - radius;
  const entrySteps = 48;
  for (let i = 0; i <= entrySteps; i += 1) {
    const t = i / entrySteps;
    samples.push({ x: cx, y: lerp(entryFrom, entryTo, t), kind: "line" });
  }

  const circleSteps = 400;
  for (let i = 1; i <= circleSteps; i += 1) {
    const t = i / circleSteps;
    const angle = -Math.PI / 2 + t * Math.PI * 2 * CIRCLE_TURNS;
    samples.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      kind: "circle",
    });
  }

  const exitFrom = cy + radius;
  const exitTo = height * 1.28;
  const exitSteps = 48;
  for (let i = 1; i <= exitSteps; i += 1) {
    const t = i / exitSteps;
    samples.push({ x: cx, y: lerp(exitFrom, exitTo, t), kind: "line" });
  }

  const path: Sample[] = [];
  let s = 0;
  samples.forEach((sample, index) => {
    if (index > 0) {
      const prev = samples[index - 1];
      if (prev) s += Math.hypot(sample.x - prev.x, sample.y - prev.y);
    }
    path.push({ ...sample, s });
  });
  return path;
}

function sampleAt(path: Sample[], distance: number): Sample | null {
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last || distance < first.s || distance > last.s) return null;

  let lo = 0;
  let hi = path.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    const sample = path[mid];
    if (!sample || sample.s <= distance) lo = mid;
    else hi = mid;
  }

  const a = path[lo];
  const b = path[hi] ?? a;
  if (!a || !b) return null;
  const span = b.s - a.s;
  const t = span <= 0 ? 0 : (distance - a.s) / span;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    s: distance,
    kind: t < 0.5 ? a.kind : b.kind,
  };
}

function sizeAt(
  distance: number,
  circleStart: number,
  circleEnd: number,
  spacing: number,
): number {
  const growStart = circleStart - spacing * 0.55;
  const growEnd = circleStart + spacing * 0.2;
  const shrinkStart = circleEnd - spacing;
  const shrinkEnd = circleEnd + spacing * 0.35;

  if (distance <= growStart) return LINE_DOT;
  if (distance < growEnd) {
    return lerp(LINE_DOT, RING_DOT, (distance - growStart) / (growEnd - growStart));
  }
  if (distance < shrinkStart) return RING_DOT;
  if (distance < shrinkEnd) {
    return lerp(RING_DOT, LINE_DOT, (distance - shrinkStart) / (shrinkEnd - shrinkStart));
  }
  return LINE_DOT;
}

function beadsAt(width: number, height: number, progress: number, colors: string[]): Bead[] {
  const path = buildPath(width, height);
  const last = path[path.length - 1];
  if (!last) return [];

  const radius = Math.min(width, height) * LOOP_RADIUS_RATIO;
  const spacing = (Math.PI * 2 * radius) / colors.length;
  const snakeLength = spacing * (colors.length - 1);
  const travel = last.s + snakeLength;
  const head = clamp01(progress) * travel;
  const circleStart = path.find((sample) => sample.kind === "circle")?.s ?? 0;
  const circleEnd =
    [...path].reverse().find((sample) => sample.kind === "circle")?.s ?? last.s;

  return colors.flatMap((color, index) => {
    const distance = head - index * spacing;
    const point = sampleAt(path, distance);
    if (!point) return [];
    return [
      {
        x: point.x,
        y: point.y,
        size: sizeAt(distance, circleStart, circleEnd, spacing),
        color,
      },
    ];
  });
}

type Props = {
  progress: number;
};

export function FilterPreviewSnake({ progress }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const colors = useMemo(() => inducerPairImages.map((item) => item.hex), []);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      setSize({ width: root.clientWidth, height: root.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const beads = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [];
    return beadsAt(size.width, size.height, progress, colors);
  }, [colors, progress, size.height, size.width]);

  return (
    <div ref={rootRef} className="join-float__filter-preview" aria-hidden="true">
      {size.width > 0 ? (
        <svg
          className="join-float__filter-preview-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          width={size.width}
          height={size.height}
        >
          {beads.map((bead, index) => (
            <circle
              key={`${bead.color}-${index}`}
              cx={bead.x}
              cy={bead.y}
              r={bead.size / 2}
              fill={bead.color}
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
