"use client";
/* Air/water boundary = two background layers + optional page.waterlineHighlightOpacity only. */

import { useRef, type CSSProperties } from "react";

import { blueLexiconHeroConfig } from "./blueLexiconHeroConfig";
import { FluidWaterField } from "./FluidWaterField";
import { LexiconDisk } from "./LexiconDisk";
import { WaterRippleLayer } from "./WaterRippleLayer";

const cfg = blueLexiconHeroConfig;

export function BlueLexiconHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const wl = cfg.layout.waterlineYPercent;
  const hi = cfg.page.waterlineHighlightOpacity;

  const sectionStyle: CSSProperties = {
    "--wl-pct": `${wl}%`,
    "--upper-bg": cfg.page.upperBackground,
    "--disk-nudge": `${cfg.layout.diskCenterOffsetPx}px`,
  } as CSSProperties;

  const upperZoneStyle: CSSProperties = {
    height: "var(--wl-pct)",
    backgroundColor: "var(--upper-bg)",
    ...(hi > 0
      ? {
          boxShadow: `inset 0 -1px 0 0 rgba(255, 255, 255, ${hi})`,
        }
      : {}),
  };

  const diskWrapperStyle: CSSProperties = {
    left: "50%",
    top: "var(--wl-pct)",
    transform: "translate(-50%, calc(-50% + var(--disk-nudge, 0px)))",
  };

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[calc(100dvh-5.75rem)] overflow-hidden px-5 pb-10 pt-6 md:px-10"
      style={sectionStyle}
      aria-labelledby="blue-lexicon-title"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0"
        style={upperZoneStyle}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 overflow-hidden"
        style={{ top: "var(--wl-pct)" }}
        aria-hidden
      >
        <FluidWaterField />
      </div>

      <WaterRippleLayer sectionRef={sectionRef} />

      <div className="relative z-20 mx-auto flex w-full max-w-4xl flex-col items-center px-2 pt-2 text-center md:pt-6">
        <h1
          id="blue-lexicon-title"
          className="font-display text-[clamp(2rem,6.5vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[clamp(2.5rem,5.2vw,4.25rem)]"
          style={{ color: cfg.colors.title }}
        >
          {cfg.title}
        </h1>
        <p
          className="mt-4 max-w-xl font-body text-[clamp(0.9rem,2.1vw,1.05rem)] font-normal leading-relaxed md:mt-5"
          style={{ color: cfg.colors.subtitle }}
        >
          {cfg.subtitle}
        </p>
      </div>

      <div className="absolute z-10 px-4" style={diskWrapperStyle}>
        <LexiconDisk />
      </div>
    </section>
  );
}
