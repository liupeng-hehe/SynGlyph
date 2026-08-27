"use client";

import type { MutableRefObject, RefObject } from "react";

export const AB_RANGE = 80;

export type ByoChromaStackProps = {
  compact: boolean;
  /** Letters-phase card: larger chroma square to match reference layout. */
  planeSize?: "default" | "lettersHero" | "popover";
  planeRef: RefObject<HTMLDivElement>;
  chromaCanvasRef: RefObject<HTMLCanvasElement>;
  dragPlane: MutableRefObject<boolean>;
  labL: number;
  labA: number;
  labB: number;
  swatchPreview: string;
  lightnessTrackGradient: string;
  ink: string;
  onPlaneMouse: (clientX: number, clientY: number) => void;
  syncHexInputsFromNumbers: (L: number, a: number, b: number) => void;
  /** Optional title above controls (popover uses letter label). */
  title?: string;
};

export function ByoChromaStack({
  compact,
  planeSize = "default",
  planeRef,
  chromaCanvasRef,
  dragPlane,
  labL,
  labA,
  labB,
  swatchPreview,
  lightnessTrackGradient,
  ink,
  onPlaneMouse,
  syncHexInputsFromNumbers,
  title,
}: ByoChromaStackProps) {
  const lettersHero = compact && planeSize === "lettersHero";
  const popover = compact && planeSize === "popover";
  const planeMax = compact ? (lettersHero ? 202 : popover ? 168 : 200) : 300;
  const planeMin = compact ? (lettersHero ? 157 : popover ? 132 : 148) : 220;
  const mtChroma = compact ? (lettersHero ? "mt-1.5" : popover ? "mt-1" : "mt-2") : "mt-3";
  const mtLight = compact ? (lettersHero ? "mt-3" : popover ? "mt-2" : "mt-4") : "mt-8";
  const mtNums = compact ? (lettersHero ? "mt-2.5" : popover ? "mt-2" : "mt-3") : "mt-6";
  const numPy = compact ? (lettersHero ? "py-1" : "py-1") : "py-2";
  const titleClass = compact ? "text-xs font-semibold" : "text-sm font-semibold";

  return (
    <>
      {title ? (
        <p className={`${titleClass} text-center tracking-tight`} style={{ color: ink }}>
          {title}
        </p>
      ) : null}
      <div className={compact && !title ? "mt-0" : compact ? "mt-1" : "mt-6"}>
        {!compact ? (
          <>
            <p className={titleClass} style={{ color: ink }}>
              Chroma (a* × b*) at this L*
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-75 sm:text-sm">
              Horizontal: green → red. Vertical: blue → yellow. The map redraws when you change L*.
            </p>
          </>
        ) : null}
        <div
          ref={planeRef}
          role="presentation"
          className={`relative mx-auto ${mtChroma} w-full cursor-crosshair touch-none`}
          style={{
            aspectRatio: "1 / 1",
            maxWidth: planeMax,
            minHeight: planeMin,
            minWidth: compact ? (lettersHero ? 150 : popover ? 128 : 148) : 220,
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            dragPlane.current = true;
            onPlaneMouse(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            dragPlane.current = false;
            try {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            } catch {
              /* already released */
            }
          }}
          onPointerCancel={(e) => {
            dragPlane.current = false;
            try {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onPointerMove={(e) => {
            if (dragPlane.current) onPlaneMouse(e.clientX, e.clientY);
          }}
        >
          <canvas
            ref={chromaCanvasRef}
            className="absolute inset-0 block h-full w-full rounded-2xl border border-[#002FA7]/15 shadow-inner"
            aria-hidden
          />
          <div
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,47,167,0.35),0_2px_8px_rgba(0,0,0,0.12)] ${
              compact ? (lettersHero ? "h-3.5 w-3.5" : "h-3.5 w-3.5") : "h-5 w-5"
            }`}
            style={{
              left: `${50 + (labA / AB_RANGE) * 50}%`,
              top: `${50 - (labB / AB_RANGE) * 50}%`,
              backgroundColor: swatchPreview,
            }}
          />
        </div>
      </div>

      <div className={mtLight}>
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide opacity-80 sm:text-sm">
            Lightness (L*)
          </label>
          <span className="font-mono text-xs tabular-nums opacity-85 sm:text-sm">
            {Math.round(labL * 10) / 10}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 ${compact ? "mt-1.5" : "mt-3"} sm:gap-2`}>
          <span
            className="w-5 shrink-0 text-left text-[10px] font-medium tabular-nums opacity-70 sm:w-6 sm:text-[11px]"
            style={{ color: ink }}
          >
            0
          </span>
          <div className="relative h-3 min-w-0 flex-1">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 right-0 rounded-full border border-[#002FA7]/18 shadow-inner"
              style={{ background: lightnessTrackGradient }}
            />
            <div
              className="pointer-events-none absolute top-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white sm:h-4 sm:w-4"
              style={{
                left: `${Math.max(0, Math.min(100, labL))}%`,
                backgroundColor: swatchPreview,
                boxShadow: "0 0 0 1px rgba(0,47,167,0.25), 0 2px 8px rgba(0,0,0,0.12)",
              }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={labL}
              onChange={(e) => syncHexInputsFromNumbers(Number(e.target.value), labA, labB)}
              className="absolute inset-0 z-[2] h-full w-full cursor-pointer opacity-0"
              aria-label="Lightness L star"
            />
          </div>
          <span
            className="w-5 shrink-0 text-right text-[10px] font-medium tabular-nums opacity-70 sm:w-6 sm:text-[11px]"
            style={{ color: ink }}
          >
            100
          </span>
        </div>
      </div>

      <div className={`${mtNums} grid grid-cols-3 ${compact ? "gap-1.5" : "gap-3"}`}>
        {(
          [
            ["L*", labL, (v: number) => syncHexInputsFromNumbers(v, labA, labB)],
            ["a*", labA, (v: number) => syncHexInputsFromNumbers(labL, v, labB)],
            ["b*", labB, (v: number) => syncHexInputsFromNumbers(labL, labA, v)],
          ] as const
        ).map(([label, val, fn]) => (
          <div key={label}>
            <label className="text-[10px] font-medium opacity-65 sm:text-[11px]">{label}</label>
            <input
              type="number"
              value={Math.round(val * 100) / 100}
              onChange={(e) => fn(Number(e.target.value))}
              className={`mt-0.5 w-full rounded-lg border border-[#002FA7]/18 bg-white px-1.5 ${numPy} text-xs sm:text-sm`}
              style={{ color: ink }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
