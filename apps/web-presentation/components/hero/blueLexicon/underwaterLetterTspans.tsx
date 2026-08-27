import type { ReactNode } from "react";

import {
  blueLexiconHeroConfig,
  underwaterPaletteIndexForArcPosition,
} from "./blueLexiconHeroConfig";

export type PairedRingTspans = {
  surface: ReactNode[];
  submerged: ReactNode[];
};

type BuildOptions = {
  text: string;
  surfaceFill: string;
  surfaceOpacity: number;
  /** 0..1 per ring — shifts hue bands along arc (not word-based). */
  arcBias: number;
  /** Global drift step — slowly rotates underwater hue pattern around the ring. */
  paletteDriftSteps: number;
};

/**
 * Matched per-character `<tspan>` chains. Surface = uniform IKB; submerged = palette
 * by **arc position** along the string (`(i+0.5)/N`), not `(i+phase)%n` token cycling.
 * Klein vs chroma at the **waterline** comes from `WaterlineRingPair` clip *outside* rotation.
 */
export function buildPairedRingTspans({
  text,
  surfaceFill,
  surfaceOpacity,
  arcBias,
  paletteDriftSteps,
}: BuildOptions): PairedRingTspans {
  const cycle = blueLexiconHeroConfig.underwaterLetterCycle;
  const palette = cycle.palette;
  const n = palette.length;
  const opacity = cycle.submergedTextOpacity;
  const chars = Array.from(text);
  const N = chars.length;
  const surface: ReactNode[] = [];
  const submerged: ReactNode[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isWs = /\s/.test(ch);

    surface.push(
      <tspan key={i} fill={surfaceFill} fillOpacity={surfaceOpacity}>
        {ch}
      </tspan>,
    );

    const idx = underwaterPaletteIndexForArcPosition(
      i,
      N,
      arcBias,
      paletteDriftSteps,
      n,
    );

    if (cycle.skipWhitespace && isWs) {
      submerged.push(
        <tspan key={i} fill={palette[idx]} fillOpacity={opacity * 0.5}>
          {ch}
        </tspan>,
      );
      continue;
    }

    submerged.push(
      <tspan key={i} fill={palette[idx]} fillOpacity={opacity}>
        {ch}
      </tspan>,
    );
  }

  return { surface, submerged };
}

/** @deprecated use `buildPairedRingTspans` object form */
export function buildUnderwaterLetterTspans(opts: {
  text: string;
  phase: number;
}): ReactNode[] {
  const { ringColors, ringText, underwaterLetterCycle } = blueLexiconHeroConfig;
  return buildPairedRingTspans({
    text: opts.text,
    surfaceFill: ringColors.kleinBlue,
    surfaceOpacity: ringText.surfaceOpacity,
    arcBias: 0,
    paletteDriftSteps: opts.phase,
  }).submerged;
}
