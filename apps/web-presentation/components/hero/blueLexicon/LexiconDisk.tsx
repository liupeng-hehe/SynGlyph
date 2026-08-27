"use client";
/* Ring copy: only `buildPairedRingTspans` → surface + submerged tspans (same breaks).
   Do not mix plain string + `buildUnderwaterLetterTspans` — textPath layout diverges. */

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  blueLexiconHeroConfig,
  repeatRingTokens,
  ringCharBudget,
} from "./blueLexiconHeroConfig";
import styles from "./blueLexicon.module.css";
import { CLIP_LOWER, CLIP_UPPER, WaterlineRingPair } from "./WaterlineRingPair";
import { buildPairedRingTspans } from "./underwaterLetterTspans";

const PATH_IDS = {
  outer: "blue-lexicon-ring-outer",
  middle: "blue-lexicon-ring-middle",
  inner: "blue-lexicon-ring-inner",
} as const;

function circlePathD(cx: number, cy: number, r: number): string {
  return `M ${cx},${cy - r} A ${r} ${r} 0 1 1 ${cx},${cy + r} A ${r} ${r} 0 1 1 ${cx},${cy - r}`;
}

type LexiconDiskProps = {
  className?: string;
};

export function LexiconDisk({ className = "" }: LexiconDiskProps) {
  const cfg = blueLexiconHeroConfig;
  const { center, radii, viewBoxSize, startOffsetPct, clipWaterlineY } =
    cfg.svg;
  const sep = cfg.ringSeparator;
  const f = cfg.animation.hoverSlowdownFactor;
  const arcBias = cfg.underwaterLetterCycle.ringArcBias;
  const driftMs = cfg.underwaterLetterCycle.paletteDriftIntervalMs;

  const [paletteDrift, setPaletteDrift] = useState(0);

  useEffect(() => {
    if (driftMs <= 0) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const id = window.setInterval(() => {
      setPaletteDrift((d) => d + 1);
    }, driftMs);
    return () => window.clearInterval(id);
  }, [driftMs]);

  const outerText = repeatRingTokens(
    cfg.rings.outer,
    sep,
    ringCharBudget(radii.outer),
  );
  const middleText = repeatRingTokens(
    cfg.rings.middle,
    sep,
    ringCharBudget(radii.middle, 11),
  );
  const innerText = repeatRingTokens(
    cfg.rings.inner,
    sep,
    ringCharBudget(radii.inner, 10),
  );

  const klein = cfg.ringColors.kleinBlue;
  const surfaceOp = cfg.ringText.surfaceOpacity;

  const outerPair = useMemo(
    () =>
      buildPairedRingTspans({
        text: outerText,
        surfaceFill: klein,
        surfaceOpacity: surfaceOp,
        arcBias: arcBias.outer,
        paletteDriftSteps: paletteDrift,
      }),
    [outerText, arcBias.outer, paletteDrift, klein, surfaceOp],
  );
  const middlePair = useMemo(
    () =>
      buildPairedRingTspans({
        text: middleText,
        surfaceFill: klein,
        surfaceOpacity: surfaceOp,
        arcBias: arcBias.middle,
        paletteDriftSteps: paletteDrift,
      }),
    [middleText, arcBias.middle, paletteDrift, klein, surfaceOp],
  );
  const innerPair = useMemo(
    () =>
      buildPairedRingTspans({
        text: innerText,
        surfaceFill: klein,
        surfaceOpacity: surfaceOp,
        arcBias: arcBias.inner,
        paletteDriftSteps: paletteDrift,
      }),
    [innerText, arcBias.inner, paletteDrift, klein, surfaceOp],
  );

  const diskStyle: CSSProperties = {
    width: `clamp(${cfg.diskSize.minPx}px, min(${cfg.diskSize.vwCap}vw, ${cfg.diskSize.maxPx}px), ${cfg.diskSize.maxPx}px)`,
    height: `clamp(${cfg.diskSize.minPx}px, min(${cfg.diskSize.vwCap}vw, ${cfg.diskSize.maxPx}px), ${cfg.diskSize.maxPx}px)`,
    "--dur-outer": `${cfg.animation.outerSec}s`,
    "--dur-mid": `${cfg.animation.middleSec}s`,
    "--dur-inner": `${cfg.animation.innerSec}s`,
    "--dur-outer-slow": `${cfg.animation.outerSec * f}s`,
    "--dur-mid-slow": `${cfg.animation.middleSec * f}s`,
    "--dur-inner-slow": `${cfg.animation.innerSec * f}s`,
    "--klein-blue": cfg.ringColors.kleinBlue,
    "--klein-blue-hover": cfg.ringColors.kleinBlueHover,
  } as CSSProperties;

  const textUpper =
    "font-body uppercase tracking-[0.14em] [text-rendering:geometricPrecision]";
  const innerLower = `font-body normal-case [font-variant:small-caps] tracking-[0.18em] ${cfg.ringText.inner}`;

  return (
    <div
      className={`${styles.lexiconDisk} relative shrink-0 rounded-full shadow-[0_28px_70px_-14px_rgba(2,12,45,0.55)] ${className}`}
      style={diskStyle}
    >
      <svg
        className="block h-full w-full rounded-full"
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        aria-hidden
      >
        <defs>
          <clipPath id={CLIP_UPPER} clipPathUnits="userSpaceOnUse">
            <rect x={0} y={0} width={viewBoxSize} height={clipWaterlineY} />
          </clipPath>
          <clipPath id={CLIP_LOWER} clipPathUnits="userSpaceOnUse">
            <rect
              x={0}
              y={clipWaterlineY}
              width={viewBoxSize}
              height={viewBoxSize - clipWaterlineY}
            />
          </clipPath>
          <path
            id={PATH_IDS.outer}
            d={circlePathD(center, center, radii.outer)}
            fill="none"
          />
          <path
            id={PATH_IDS.middle}
            d={circlePathD(center, center, radii.middle)}
            fill="none"
          />
          <path
            id={PATH_IDS.inner}
            d={circlePathD(center, center, radii.inner)}
            fill="none"
          />
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radii.outer + 18}
          fill={cfg.colors.diskPlateFill}
          stroke={cfg.colors.diskRim}
          strokeWidth={1}
        />
        <WaterlineRingPair
          pathId={PATH_IDS.outer}
          ringClassName={styles.ringOuter}
          startOffset={startOffsetPct.outer}
          surfaceSpans={<>{outerPair.surface}</>}
          submergedSpans={<>{outerPair.submerged}</>}
          upperTextClass={`${textUpper} ${cfg.ringText.outer}`}
          lowerTextClass={`${textUpper} ${cfg.ringText.outer}`}
        />
        <WaterlineRingPair
          pathId={PATH_IDS.middle}
          ringClassName={styles.ringMiddle}
          startOffset={startOffsetPct.middle}
          surfaceSpans={<>{middlePair.surface}</>}
          submergedSpans={<>{middlePair.submerged}</>}
          upperTextClass={`${textUpper} ${cfg.ringText.middle}`}
          lowerTextClass={`${textUpper} ${cfg.ringText.middle}`}
        />
        <WaterlineRingPair
          pathId={PATH_IDS.inner}
          ringClassName={styles.ringInner}
          startOffset={startOffsetPct.inner}
          surfaceSpans={<>{innerPair.surface}</>}
          submergedSpans={<>{innerPair.submerged}</>}
          upperTextClass={innerLower}
          lowerTextClass={innerLower}
        />
      </svg>
    </div>
  );
}
