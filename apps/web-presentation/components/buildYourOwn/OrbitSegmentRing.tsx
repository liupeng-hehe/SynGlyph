"use client";

import type { CSSProperties, ReactNode } from "react";

import type { LightGlyphCss } from "@/lib/pxsVisual";

export type CenterWordSlot = {
  key: string;
  char: string;
  color: string;
  /** Legacy: used when glyphCss is absent. */
  textShadow?: string;
  /** P×S-derived style (English annotate / text-reveal). */
  glyphCss?: LightGlyphCss;
  /** 0–1 vertical “scan” lines intensity (spread-driven). */
  scanlines?: number;
  selectable?: boolean;
  focused?: boolean;
  onSelect?: () => void;
  /** Fisheye / strip: 1 = focus; smaller values shrink side letters. */
  displayScale?: number;
};

type LabHeroProps = {
  centerLabel?: string;
  /** When set (no letter strip), replaces single-line center label — e.g. reading map in Test phase. */
  centerContent?: ReactNode;
  centerSlots?: CenterWordSlot[];
  centerColor?: string;
  /** Single-letter path: full glyph style from P×S. */
  centerGlyphCss?: LightGlyphCss;
  /** English annotate page halo/blur formula (preferred for letters-phase parity). */
  centerAnnotateStyle?: CSSProperties;
  centerScanlines?: number;
  caption?: string;
  /** Inline control next to caption (e.g. info button). */
  captionAccessory?: ReactNode;
  /**
   * Constrain strip + caption width (e.g. `max-w-[min(100%,26rem)]`) so the focused letter column
   * aligns with a LAB card below that uses the same max-width. Uses an equal-column grid for letters
   * so the middle slot’s center matches the strip’s horizontal center when it is centered in the window.
   */
  centerStripMaxWidthClass?: string;
};

const CAPTION = "rgba(30, 32, 36, 0.62)";
const FOCUS_RING = "rgba(0, 47, 167, 0.55)";
const CARD_OFFSET = "#FFFCF3";

function defaultSlotShadow(hex: string): string {
  const h = hex.startsWith("#") ? hex : `#${hex}`;
  const core = h.length >= 7 ? h.slice(0, 7) : "#002FA7";
  return `0 0 18px ${core}55, 0 1px 0 rgba(255,255,255,0.9)`;
}

function ScanlineOverlay({ strength }: { strength: number }) {
  if (strength < 0.06) return null;
  const op = 0.18 + strength * 0.5;
  const xs = [0.14, 0.32, 0.5, 0.68, 0.86];
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[5px]" aria-hidden>
      {xs.map((x) => (
        <span
          key={x}
          className="absolute top-[10%] bottom-[10%] w-px bg-gradient-to-b from-transparent via-[#002FA7]/25 to-transparent"
          style={{
            left: `${x * 100}%`,
            opacity: op,
          }}
        />
      ))}
    </span>
  );
}

/** Left-column focus: large word or letter + progress caption only (no ring). */
export function OrbitSegmentRing({
  centerLabel = "",
  centerContent,
  centerSlots,
  centerColor,
  centerGlyphCss,
  centerAnnotateStyle,
  centerScanlines = 0,
  caption,
  captionAccessory,
  centerStripMaxWidthClass,
}: LabHeroProps) {
  const slotCount = centerSlots?.length ?? 0;
  const wordFontSize =
    slotCount > 0
      ? `clamp(2.05rem, min(7vw, calc((min(100cqi, 760px) - 1rem) / ${Math.max(slotCount + 1, 5)} * 1.18)), 4.35rem)`
      : centerLabel.length > 5
        ? "clamp(1.85rem, 6vw, 3rem)"
        : centerLabel.length <= 1
          ? "clamp(3.75rem, 16vw, 7rem)"
          : "clamp(3.15rem, 12vw, 5.75rem)";
  const letterFill = centerColor ?? "rgba(28, 30, 34, 0.92)";
  const labelGlow =
    centerColor && centerColor.startsWith("#") && centerColor.length >= 7
      ? `0 0 22px ${centerColor.slice(0, 7)}77, 0 1px 0 rgba(255,255,255,0.9)`
      : "0 1px 0 rgba(255,255,255,0.9), 0 10px 24px rgba(0,0,0,0.06), 0 3px 10px rgba(0,0,0,0.04)";

  const labelStyle: CSSProperties = centerAnnotateStyle
    ? {
        ...centerAnnotateStyle,
        fontSize: wordFontSize,
        fontFeatureSettings: '"lnum" 1',
        padding: "0.08em 0.12em",
      }
    : centerGlyphCss
      ? {
          fontSize: wordFontSize,
          fontFeatureSettings: '"lnum" 1' as const,
          color: centerGlyphCss.color,
          opacity: centerGlyphCss.opacity,
          textShadow: centerGlyphCss.textShadow,
          WebkitTextStroke: centerGlyphCss.WebkitTextStroke,
          paintOrder: centerGlyphCss.paintOrder,
          filter: centerGlyphCss.filter,
          padding: "0.08em 0.12em",
        }
      : {
          fontSize: wordFontSize,
          fontFeatureSettings: '"lnum" 1' as const,
          color: letterFill,
          textShadow: labelGlow,
          padding: "0.08em 0.12em",
        };

  const stripColCount = slotCount > 0 ? Math.max(1, 2 * slotCount - 1) : 1;

  return (
    <div
      className={`relative mx-auto w-full py-2 ${centerStripMaxWidthClass ?? "max-w-full"}`}
      style={{ containerType: "inline-size" }}
    >
      <div className="mx-auto w-full px-2 text-center sm:px-3">
        {centerSlots && centerSlots.length > 0 ? (
          <div
            className="mx-auto grid w-full items-center gap-x-[1.68rem] overflow-visible px-1 py-1.5 sm:gap-x-[2.8rem] sm:px-2"
            style={{
              gridTemplateColumns: `repeat(${stripColCount}, minmax(0, 1fr))`,
            }}
          >
            {centerSlots.flatMap((s, slotIdx) => {
              const shadow = s.textShadow ?? defaultSlotShadow(s.color);
              const g = s.glyphCss;
              const letterStyle = g
                ? {
                    fontSize: wordFontSize,
                    fontFeatureSettings: '"lnum" 1' as const,
                    color: g.color,
                    opacity: g.opacity,
                    textShadow: g.textShadow,
                    WebkitTextStroke: g.WebkitTextStroke,
                    paintOrder: g.paintOrder,
                    filter: g.filter,
                  }
                : {
                    fontSize: wordFontSize,
                    fontFeatureSettings: '"lnum" 1' as const,
                    color: s.color,
                    textShadow: shadow,
                  };
              const scale = s.displayScale ?? 1;
              const wrapScale = {
                transform: `scale(${scale})`,
                transformOrigin: "center center" as const,
              };

              const inner =
                s.selectable && s.onSelect ? (
                  <button
                    type="button"
                    onClick={s.onSelect}
                    className="relative min-w-0 font-display font-semibold leading-[1.15] tracking-[0.06em] transition duration-200 sm:tracking-[0.08em]"
                    style={{
                      ...letterStyle,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0.12em 0.14em 0.2em",
                      borderRadius: 6,
                      boxShadow: s.focused
                        ? `0 0 0 2px ${FOCUS_RING}, 0 0 0 4px ${CARD_OFFSET}`
                        : undefined,
                    }}
                  >
                    <ScanlineOverlay strength={s.scanlines ?? 0} />
                    <span className="relative z-[1]">{s.char}</span>
                  </button>
                ) : (
                  <span
                    className="relative min-w-0 font-display font-semibold leading-[1.15] tracking-[0.06em] sm:tracking-[0.08em]"
                    style={{
                      ...letterStyle,
                      padding: "0.12em 0.14em 0.2em",
                      borderRadius: 6,
                      boxShadow: s.focused
                        ? `0 0 0 2px ${FOCUS_RING}, 0 0 0 4px ${CARD_OFFSET}`
                        : undefined,
                    }}
                  >
                    <ScanlineOverlay strength={s.scanlines ?? 0} />
                    <span className="relative z-[1]">{s.char}</span>
                  </span>
                );

              const letterCell = (
                <div key={s.key} className="flex min-w-0 items-center justify-center">
                  <span className="inline-flex items-center justify-center px-0.5 sm:px-1" style={wrapScale}>
                    {inner}
                  </span>
                </div>
              );

              if (slotIdx === 0) return [letterCell];
              return [
                <div key={`sep-${s.key}`} className="flex items-center justify-center" aria-hidden>
                  <span className="shrink-0 font-serif text-xl font-black leading-none text-[#002FA7] opacity-[0.72] sm:text-2xl sm:opacity-80">
                    ·
                  </span>
                </div>,
                letterCell,
              ];
            })}
          </div>
        ) : centerContent ? (
          <div className="mx-auto w-full max-w-[min(100%,36rem)] px-1 py-1">{centerContent}</div>
        ) : (
          <span className="relative inline-block">
            <ScanlineOverlay strength={centerScanlines} />
            <span className="relative z-[1] inline-block font-display font-semibold leading-[1.1] tracking-tight" style={labelStyle}>
              {centerLabel}
            </span>
          </span>
        )}
      </div>
      {caption || captionAccessory ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {caption ? (
            <p className="text-center text-[13px] font-medium leading-snug tracking-wide" style={{ color: CAPTION }}>
              {caption}
            </p>
          ) : null}
          {captionAccessory}
        </div>
      ) : null}
    </div>
  );
}
