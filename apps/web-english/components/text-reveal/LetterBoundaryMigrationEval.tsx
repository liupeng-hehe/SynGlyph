"use client";

import type { LetterPredictionEntry } from "@/lib/modelFeedbackTypes";

export type MigrationLeanByLeftIndex = Record<number, { lean: number }>;

function clampLean(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Evaluate-only: annotate how inter-letter color migration should lean between each pair.
 * Does not change model outputs; stored on feedback as letterBoundaryMigrationEval.
 */
export function LetterBoundaryMigrationEvalPanel({
  rows,
  value,
  onChange,
  disabled,
  embedded,
}: {
  rows: LetterPredictionEntry[];
  value: MigrationLeanByLeftIndex;
  onChange: (next: MigrationLeanByLeftIndex) => void;
  disabled?: boolean;
  /** Inside 词内预览 card: flatter chrome */
  embedded?: boolean;
}) {
  if (rows.length < 2) return null;

  const shell =
    embedded === true
      ? "border-t border-violet-200/70 bg-violet-50/40 px-0 pt-2 mt-2"
      : "rounded-lg border border-violet-200 bg-violet-50/50 px-2 py-2";

  return (
    <div className={shell}>
      <div className="text-[10px] font-medium text-violet-950">字母间迁移（Evaluate）</div>
      <p className="mt-0.5 text-[9px] leading-snug text-zinc-600">
        标注相邻字母边界处颜色混合（−1 左字母全占，0 中性，+1 右字母全占）。Edits 预览：−1 时右侧字母完全为左侧色，+1
        时左侧字母完全为右侧色。保存的逐字母 Lab 色值不变。
      </p>
      <div className="mt-2 space-y-2">
        {rows.slice(0, -1).map((left, i) => {
          const right = rows[i + 1]!;
          const k = left.charIndex;
          const lean = value[k]?.lean ?? 0;
          return (
            <div key={k} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
              <span className="min-w-[4.5rem] font-mono text-zinc-800">
                {left.char} ↔ {right.char}
              </span>
              <span className="w-7 shrink-0 text-right text-zinc-500" title="偏左">
                左
              </span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={lean}
                disabled={disabled}
                onChange={(e) => {
                  const nextLean = clampLean(Number(e.target.value));
                  onChange({ ...value, [k]: { lean: nextLean } });
                }}
                className="min-w-[6rem] flex-1"
                aria-label={`Migration lean between ${left.char} and ${right.char}`}
              />
              <span className="w-7 shrink-0 text-zinc-500" title="偏右">
                右
              </span>
              <span className="w-10 shrink-0 font-mono tabular-nums text-zinc-700">{lean.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
