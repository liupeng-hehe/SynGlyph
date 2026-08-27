"use client";

import type { KeyboardEvent } from "react";

export type ArcWheelItem = {
  id: string;
  label: string;
};

type Props = {
  items: ArcWheelItem[];
  activeIndex: number;
  side: "left" | "right";
  animating?: boolean;
  onSelect?: (index: number) => void;
  ariaLabel: string;
  /** Title-case labels from color/emotion cards (not uppercase categories). */
  imageLabels?: boolean;
  /** Hide visible arc tracks while keeping labels interactive. */
  hideTracks?: boolean;
};

const VIEW_W = 440;
const VIEW_H = 560;
const CY = 280;

const R_OUTER = 420;
const OUTER_STROKE = 5;
const INNER_STROKE = 1;
/** Empty space between outer inner edge and inner outer edge (parallel, never touch). */
const TRACK_GAP_PX = 10;
const R_INNER =
  R_OUTER - OUTER_STROKE / 2 - TRACK_GAP_PX - INNER_STROKE / 2;
const R_TICK_INNER = R_INNER + INNER_STROKE / 2 + 1;
const R_TICK_OUTER = R_OUTER - OUTER_STROKE / 2 - 1;
/** Labels anchor on the centre of the thick outer track. */
const R_LABEL = R_OUTER;

const LABEL_FONT_SIZE = 30;
const IMAGE_LABEL_FONT_SIZE = 34;
const IMAGE_ACTIVE_LABEL_FONT_SIZE = 52;
const LABEL_LETTER_SPACING = "0.05em";

const STEP_DEG = 15;
const ARC_HALF_SPAN = 52;
const MAX_VISIBLE_OFFSET = 5;

/**
 * `) CARD (` — both arcs bow toward the centre card.
 * Left  `)` : centre west, east segment.
 * Right `(` : centre east, west segment.
 */
const WHEEL = {
  left: {
    cx: -18,
    baseAngle: 0,
    stepSign: 1,
    preserve: "xMinYMid meet" as const,
  },
  right: {
    cx: 458,
    baseAngle: 180,
    stepSign: -1,
    preserve: "xMaxYMid meet" as const,
  },
} as const;

function itemAngleDeg(side: "left" | "right", offset: number): number {
  const cfg = WHEEL[side];
  return cfg.baseAngle + offset * STEP_DEG * cfg.stepSign;
}

function arcAngleRange(side: "left" | "right") {
  const cfg = WHEEL[side];
  return {
    a0: cfg.baseAngle - ARC_HALF_SPAN,
    a1: cfg.baseAngle + ARC_HALF_SPAN,
  };
}

function polar(cx: number, cy: number, radius: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

function trackArcPath(side: "left" | "right", radius: number): string {
  const cfg = WHEEL[side];
  const { a0, a1 } = arcAngleRange(side);
  const steps = 64;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = a0 + (i / steps) * (a1 - a0);
    const { x, y } = polar(cfg.cx, CY, radius, angle);
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(" ");
}

/**
 * Whole-word tilt along the outer arc — like wordblue reference (Fig. 2).
 * Offset-based so labels above/below active stay readable (never flip 180°).
 */
function labelRotateDeg(side: "left" | "right", offset: number): number {
  if (offset === 0) return 0;
  const tiltPerStep = STEP_DEG * 0.72;
  return side === "left" ? -offset * tiltPerStep : offset * tiltPerStep;
}

function opacityForOffset(offset: number, isActive: boolean): number {
  if (isActive) return 1;
  const abs = Math.abs(offset);
  return Math.max(0.24, 0.46 - abs * 0.05);
}

export function SemicircleArcWheel({
  items,
  activeIndex,
  side,
  animating = false,
  onSelect,
  ariaLabel,
  imageLabels = false,
  hideTracks = false,
}: Props) {
  const cfg = WHEEL[side];
  const outerD = trackArcPath(side, R_OUTER);
  const innerD = trackArcPath(side, R_INNER);

  const visibleItems = items
    .map((item, index) => ({ item, index, offset: index - activeIndex }))
    .filter(({ offset }) => Math.abs(offset) <= MAX_VISIBLE_OFFSET);

  const handleKey = (event: KeyboardEvent, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(index);
    }
  };

  return (
    <div
      className={`arc-wheel arc-wheel--${side}${animating ? " arc-wheel--animating" : ""}${imageLabels ? " arc-wheel--image-labels" : ""}`}
      aria-label={ariaLabel}
    >
      <svg
        className="arc-wheel__guide"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio={cfg.preserve}
        overflow="visible"
      >
        {!hideTracks ? (
          <g className="arc-wheel__tracks" aria-hidden="true">
            <path
              d={outerD}
              className="arc-wheel__track arc-wheel__track--outer"
              fill="none"
              stroke="#002fa7"
              strokeWidth={OUTER_STROKE}
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
            <path
              d={innerD}
              className="arc-wheel__track arc-wheel__track--inner"
              fill="none"
              stroke="#002fa7"
              strokeWidth={INNER_STROKE}
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
          </g>
        ) : null}

        {!hideTracks
          ? visibleItems.map(({ index, offset }) => {
              const angleDeg = itemAngleDeg(side, offset);
              const inner = polar(cfg.cx, CY, R_TICK_INNER, angleDeg);
              const outer = polar(cfg.cx, CY, R_TICK_OUTER, angleDeg);
              return (
                <line
                  key={`tick-${index}`}
                  className="arc-wheel__tick"
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="#002fa7"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  strokeLinecap="butt"
                />
              );
            })
          : null}

        {visibleItems.map(({ item, index, offset }) => {
          const isActive = index === activeIndex;
          const angleDeg = itemAngleDeg(side, offset);
          const { x, y } = polar(cfg.cx, CY, R_LABEL, angleDeg);
          const opacity = opacityForOffset(offset, isActive);
          const rotate = labelRotateDeg(side, offset);
          const displayLabel = item.label;
          const labelFontSize = imageLabels
            ? isActive
              ? IMAGE_ACTIVE_LABEL_FONT_SIZE
              : IMAGE_LABEL_FONT_SIZE
            : isActive
              ? LABEL_FONT_SIZE + 4
              : LABEL_FONT_SIZE;

          return (
            <g
              key={item.id}
              className={`arc-wheel__item${isActive ? " arc-wheel__item--active" : ""}`}
              transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotate.toFixed(2)})`}
              opacity={opacity}
              role="button"
              tabIndex={0}
              aria-current={isActive ? "true" : undefined}
              aria-label={displayLabel}
              onClick={() => onSelect?.(index)}
              onKeyDown={(event) => handleKey(event, index)}
            >
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#002fa7"
                fillOpacity={isActive ? 1 : 0.3}
                fontSize={labelFontSize}
                fontWeight={isActive ? 800 : 600}
                letterSpacing={imageLabels ? "0.03em" : LABEL_LETTER_SPACING}
                className={`font-body arc-wheel__label${isActive ? " arc-wheel__label--active" : ""}${imageLabels ? " arc-wheel__label--image" : ""}`}
              >
                {displayLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
