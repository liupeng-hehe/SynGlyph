"use client";

import type { CSSProperties } from "react";

import { blueLexiconHeroConfig } from "./blueLexiconHeroConfig";
import fluidStyles from "./fluidField.module.css";

const NOISE_FILTER_ID = "blue-lexicon-fluid-noise";

/**
 * Luminous lower-half field: layered blues + slow organic motion + optional
 * SVG turbulence (caustic-ish). Ripples render above this layer.
 */
export function FluidWaterField() {
  const ff = blueLexiconHeroConfig.fluidField;
  if (!ff.enabled) {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: blueLexiconHeroConfig.page.lowerBackground }}
        aria-hidden
      />
    );
  }

  const s = ff.motionSpeed;
  const dur = (sec: number) => `${sec / s}s`;
  const g = ff.cyanGlowIntensity;

  const rootStyle: CSSProperties = {
    "--fluid-base-gradient": ff.baseGradient,
    /** Shorter base periods so motion reads through heavy blur (tune via motionSpeed). */
    "--fluid-dur-1": dur(26),
    "--fluid-dur-2": dur(30),
    "--fluid-dur-3": dur(34),
    "--fluid-dur-4": dur(38),
    "--fluid-dur-vortex": dur(52),
    "--fluid-dur-caustic": dur(24),
    "--fluid-dur-base": dur(40),
    "--fluid-b1-bg": ff.blob1.background,
    "--fluid-b1-w": ff.blob1.widthPct,
    "--fluid-b1-h": ff.blob1.heightPct,
    "--fluid-b1-x": ff.blob1.left,
    "--fluid-b1-y": ff.blob1.top,
    "--fluid-blob-blur": `${ff.blobBlurPx}px`,
    "--fluid-b2-bg": ff.blob2.background,
    "--fluid-b2-w": ff.blob2.widthPct,
    "--fluid-b2-h": ff.blob2.heightPct,
    "--fluid-b2-r": ff.blob2.right,
    "--fluid-b2-b": ff.blob2.bottom,
    "--fluid-b3-bg": ff.blob3.background,
    "--fluid-b3-w": ff.blob3.widthPct,
    "--fluid-b3-h": ff.blob3.heightPct,
    "--fluid-b3-x": ff.blob3.left,
    "--fluid-b3-b": ff.blob3.bottom,
    "--fluid-b4-bg": ff.blob4.background,
    "--fluid-b4-w": ff.blob4.widthPct,
    "--fluid-b4-h": ff.blob4.heightPct,
    "--fluid-b4-x": ff.blob4.left,
    "--fluid-b4-y": ff.blob4.top,
    "--fluid-vortex-core": `rgba(0, 210, 245, ${0.12 * g})`,
    "--fluid-vortex-opacity": String(0.75 + 0.2 * g),
    "--fluid-caustic-a": `rgba(130, 230, 255, ${0.05 + 0.08 * g})`,
    "--fluid-caustic-b": `rgba(70, 150, 255, ${0.04 + 0.06 * g})`,
    "--fluid-caustic-c": `rgba(190, 250, 255, ${0.04 + 0.06 * g})`,
    "--fluid-caustic-opacity": String(0.65 + 0.25 * g),
    "--fluid-turbulence-opacity": String(ff.turbulenceOpacity * (0.7 + 0.3 * g)),
  } as CSSProperties;

  return (
    <div className={fluidStyles.fluidRoot} style={rootStyle} aria-hidden>
      <div className={fluidStyles.fluidBase} />
      <div className={`${fluidStyles.fluidBlob} ${fluidStyles.fluidBlob1}`} />
      <div className={`${fluidStyles.fluidBlob} ${fluidStyles.fluidBlob2}`} />
      <div className={`${fluidStyles.fluidBlob} ${fluidStyles.fluidBlob3}`} />
      <div className={`${fluidStyles.fluidBlob} ${fluidStyles.fluidBlob4}`} />
      <div className={fluidStyles.fluidVortex} />
      <div className={fluidStyles.fluidCaustic} />

      {ff.turbulenceOpacity > 0 && (
        <svg
          className={fluidStyles.fluidNoiseSvg}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <filter
              id={NOISE_FILTER_ID}
              x="-15%"
              y="-15%"
              width="130%"
              height="130%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={ff.turbulenceBaseFrequency}
                numOctaves={4}
                seed="17"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur={dur(42)}
                  values={`${ff.turbulenceBaseFrequency};${ff.turbulenceBaseFrequencyAlt};${ff.turbulenceBaseFrequency}`}
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feGaussianBlur
                in="noise"
                stdDeviation={ff.turbulenceBlurStd}
                result="blur"
              />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0.3 0 0.1 0 0
                        0.35 0 0.25 0 0.05
                        0.45 0.35 0.5 0 0.12
                        0 0 0 0.55 0"
                result="tint"
              />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter={`url(#${NOISE_FILTER_ID})`} />
        </svg>
      )}
    </div>
  );
}
