"use client";

import type { RegionView } from "./GlyphCanvas";

type Props = {
  regions: RegionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** 深色侧栏（与英文标注页一致） */
  tone?: "light" | "dark";
};

export function RegionPanel({ regions, selectedId, onSelect, onDelete, tone = "light" }: Props) {
  const dark = tone === "dark";
  return (
    <div className="space-y-2">
      <h3 className={`text-sm font-medium ${dark ? "text-white/80" : "text-stone-800"}`}>区域列表</h3>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {regions.length === 0 && (
          <li className={dark ? "text-white/45" : "text-stone-500"}>暂无区域</li>
        )}
        {regions.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
                dark
                  ? selectedId === r.id
                    ? "bg-amber-500/25 text-white"
                    : "bg-white/10 text-white/90 hover:bg-white/15"
                  : selectedId === r.id
                    ? "bg-amber-100"
                    : "bg-stone-100 hover:bg-stone-200"
              }`}
              onClick={() => onSelect(r.id)}
            >
              <span className={`truncate ${dark ? "text-white/95" : "text-stone-900"}`}>{r.name}</span>
              <span
                role="button"
                tabIndex={0}
                className={dark ? "ml-2 text-red-300 hover:text-red-200" : "ml-2 text-red-600 hover:text-red-700"}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onDelete(r.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
