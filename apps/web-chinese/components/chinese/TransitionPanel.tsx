"use client";

import type { TransitionView } from "./GlyphCanvas";

type Props = {
  transitions: TransitionView[];
  regionNames: Record<string, string>;
  onDelete: (id: string) => void;
  tone?: "light" | "dark";
};

export function TransitionPanel({ transitions, regionNames, onDelete, tone = "light" }: Props) {
  const dark = tone === "dark";
  return (
    <div className="space-y-2">
      <h3 className={`text-sm font-medium ${dark ? "text-white/80" : "text-stone-800"}`}>有向颜色过渡</h3>
      <p className={`text-[11px] leading-snug ${dark ? "text-white/40" : "text-stone-500"}`}>
        每次新建会替换当前唯一一条过渡（不累积多条）。
      </p>
      <ul className={`max-h-40 space-y-1 overflow-y-auto text-xs ${dark ? "text-white/80" : "text-stone-700"}`}>
        {transitions.length === 0 && (
          <li className={dark ? "text-white/45" : "text-stone-500"}>暂无过渡</li>
        )}
        {transitions.map((t) => (
          <li
            key={t.id}
            className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${
              dark ? "border-white/15 bg-white/5" : "border-stone-200 bg-stone-50"
            }`}
          >
            <span className="truncate">
              {regionNames[t.source_region_id] ?? t.source_region_id.slice(0, 6)} →{" "}
              {regionNames[t.target_region_id] ?? t.target_region_id.slice(0, 6)}
            </span>
            <button
              type="button"
              className={dark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-700"}
              onClick={() => onDelete(t.id)}
            >
              删
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
