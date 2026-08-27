"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LetterPredictionEntry } from "@/lib/modelFeedbackTypes";
import {
  LetterBoundaryMigrationEvalPanel,
  type MigrationLeanByLeftIndex,
} from "@/components/text-reveal/LetterBoundaryMigrationEval";
import { hexToRgb, punchRgbForDisplay, type RGB } from "@/lib/textRevealCanvasUtils";
import { mapPForRender, mapSForRender } from "@/lib/textRevealPreviewEditorMap";
import { visualStyleFromPxS } from "@/lib/textRevealPxSVisual";
import { computeWordAnnotationReviewScore } from "@/lib/wordAnnotationReviewScore";
import { WordReviewScorePanel } from "@/components/text-reveal/WordReviewScorePanel";
import { editsRowPreviewRgb } from "@/lib/letterMigrationPreviewRgb";

const PREVIEW_FONT_PX = 22;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function punchPreview(hex: string): RGB {
  return punchRgbForDisplay(hexToRgb(hex), 1.34);
}

/** Preview only: display P/S unchanged in UI; remap for render via mapPForRender / mapSForRender. */
function spanStyleForLetterRgb(rgb: RGB, pDisplay: number, sDisplay: number): CSSProperties {
  const pRender = mapPForRender(pDisplay);
  const sRender = mapSForRender(sDisplay);
  const vs = visualStyleFromPxS(pRender, sRender, rgb, PREVIEW_FONT_PX);
  return {
    color: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
    opacity: vs.fillAlpha,
    textShadow: `0 0 ${vs.shadowBlur}px ${vs.shadowColor}`,
    fontWeight: 600,
    display: "inline-block",
    marginRight: "0.06em",
  };
}

function spanStyleForLetter(hex: string, pDisplay: number, sDisplay: number): CSSProperties {
  return spanStyleForLetterRgb(punchPreview(hex), pDisplay, sDisplay);
}

export function WordLetterReviewGrid({
  rows,
  colorEdits,
  onColorEditsChange,
  promEdits,
  onPromEditsChange,
  sprEdits,
  onSprEditsChange,
  focusCharIndex,
  showColorEdit,
  showMigrationEval,
  migrationEval,
  onMigrationChange,
  migrationDisabled,
  showReviewScore,
}: {
  rows: LetterPredictionEntry[];
  colorEdits: Record<number, string>;
  onColorEditsChange: (next: Record<number, string>) => void;
  promEdits: Record<number, number>;
  onPromEditsChange: (next: Record<number, number>) => void;
  sprEdits: Record<number, number>;
  onSprEditsChange: (next: Record<number, number>) => void;
  focusCharIndex?: number | null;
  /** false when error is wrong_intensity only — color read-only */
  showColorEdit: boolean;
  /** Evaluate + minor edits: show letter-boundary migration inside preview */
  showMigrationEval?: boolean;
  migrationEval?: MigrationLeanByLeftIndex;
  onMigrationChange?: (next: MigrationLeanByLeftIndex) => void;
  migrationDisabled?: boolean;
  /** Show 0–100 deduction score + breakdown (default true) */
  showReviewScore?: boolean;
}) {
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);

  useEffect(() => {
    if (rows.length === 0) {
      setActiveCharIndex(null);
      return;
    }
    const focusOk =
      focusCharIndex != null && rows.some((r) => r.charIndex === focusCharIndex) ? focusCharIndex : null;
    setActiveCharIndex(focusOk ?? rows[0]!.charIndex);
  }, [rows, focusCharIndex]);

  const activeRow = useMemo(
    () => (activeCharIndex == null ? null : rows.find((r) => r.charIndex === activeCharIndex) ?? null),
    [rows, activeCharIndex]
  );

  const reviewScore = useMemo(
    () =>
      computeWordAnnotationReviewScore({
        rows,
        colorEdits,
        promEdits,
        sprEdits,
        migrationEval: migrationEval ?? {},
      }),
    [rows, colorEdits, promEdits, sprEdits, migrationEval]
  );

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-white px-2 py-2">
      <div className="text-[11px] font-medium text-zinc-800">词内预览（紧凑）</div>
      <p className="text-[10px] leading-snug text-zinc-500">
        上行：模型预测；下行：当前编辑。点选字母后只展开该字的 Lab / P×S。
      </p>

      <div className="space-y-1.5 rounded-md bg-zinc-50/80 px-2 py-1.5">
        <div className="flex items-baseline gap-2 text-[9px] text-zinc-500">
          <span className="w-9 shrink-0 font-medium">Model</span>
          <div
            className="min-w-0 flex-1 break-all leading-tight"
            style={{ fontSize: `${PREVIEW_FONT_PX}px`, lineHeight: 1.15 }}
          >
            {rows.map((r) => (
              <span key={r.charIndex} style={spanStyleForLetter(r.hex, r.prominence, r.spread)}>
                {r.char}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2 text-[9px] text-zinc-500">
          <span className="w-9 shrink-0 font-medium">Edits</span>
          <div
            className="min-w-0 flex-1 break-all leading-tight"
            style={{ fontSize: `${PREVIEW_FONT_PX}px`, lineHeight: 1.15 }}
          >
            {rows.map((r, i) => {
              const pv = promEdits[r.charIndex] ?? r.prominence;
              const sv = sprEdits[r.charIndex] ?? r.spread;
              const rgb = showMigrationEval
                ? editsRowPreviewRgb(rows, colorEdits, migrationEval ?? {}, i)
                : punchPreview(colorEdits[r.charIndex] ?? r.hex);
              return (
                <span key={r.charIndex} style={spanStyleForLetterRgb(rgb, pv, sv)}>
                  {r.char}
                </span>
              );
            })}
          </div>
        </div>
        {showMigrationEval && onMigrationChange && rows.length >= 2 && (
          <LetterBoundaryMigrationEvalPanel
            embedded
            rows={rows}
            value={migrationEval ?? {}}
            onChange={onMigrationChange}
            disabled={migrationDisabled}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {rows.map((r) => {
          const on = activeCharIndex === r.charIndex;
          return (
            <button
              key={r.charIndex}
              type="button"
              onClick={() => setActiveCharIndex(r.charIndex)}
              className={`min-w-[1.75rem] rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold transition-colors ${
                on ? "bg-sky-600 text-white" : "bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {r.char}
            </button>
          );
        })}
      </div>

      {showReviewScore !== false && <WordReviewScorePanel result={reviewScore} />}

      {activeRow && (
        <div className="space-y-1 rounded-md border border-zinc-100 bg-white px-1.5 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-5 text-center font-mono text-sm font-semibold text-zinc-900">{activeRow.char}</span>
            <span
              className="inline-block h-6 w-8 shrink-0 rounded border border-zinc-300"
              style={{ backgroundColor: activeRow.hex }}
              title={`Predicted ${activeRow.hex}`}
            />
            <span className="font-mono text-[9px] text-zinc-500">{activeRow.hex}</span>
            {showColorEdit ? (
              <>
                <span className="text-zinc-400">→</span>
                <input
                  type="color"
                  value={
                    (colorEdits[activeRow.charIndex] ?? activeRow.hex).startsWith("#") &&
                    (colorEdits[activeRow.charIndex] ?? activeRow.hex).length >= 7
                      ? (colorEdits[activeRow.charIndex] ?? activeRow.hex).slice(0, 7)
                      : "#888888"
                  }
                  onChange={(e) =>
                    onColorEditsChange({
                      ...colorEdits,
                      [activeRow.charIndex]: e.target.value,
                    })
                  }
                  className="h-7 w-12 shrink-0 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
                  aria-label={`Corrected color for ${activeRow.char}`}
                />
              </>
            ) : (
              <span className="text-[9px] text-zinc-400">(color locked)</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1 pl-0.5">
            <label className="flex items-center gap-2 text-[10px]">
              <span className="w-16 shrink-0 text-zinc-600">P {activeRow.prominence.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clamp01(promEdits[activeRow.charIndex] ?? activeRow.prominence)}
                onChange={(e) =>
                  onPromEditsChange({
                    ...promEdits,
                    [activeRow.charIndex]: Number(e.target.value),
                  })
                }
                className="min-w-0 flex-1"
              />
              <span className="w-7 shrink-0 font-mono text-zinc-700">
                {clamp01(promEdits[activeRow.charIndex] ?? activeRow.prominence).toFixed(2)}
              </span>
            </label>
            <label className="flex items-center gap-2 text-[10px]">
              <span className="w-16 shrink-0 text-zinc-600">S {activeRow.spread.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clamp01(sprEdits[activeRow.charIndex] ?? activeRow.spread)}
                onChange={(e) =>
                  onSprEditsChange({
                    ...sprEdits,
                    [activeRow.charIndex]: Number(e.target.value),
                  })
                }
                className="min-w-0 flex-1"
              />
              <span className="w-7 shrink-0 font-mono text-zinc-700">
                {clamp01(sprEdits[activeRow.charIndex] ?? activeRow.spread).toFixed(2)}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
