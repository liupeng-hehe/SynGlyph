"use client";

import { useMemo } from "react";
import { hexToLab, labToHex } from "@synglyph/shared";
import type { RegionView } from "./GlyphCanvas";
import { ColorWheelPicker } from "./ColorWheelPicker";

type Props = {
  region: RegionView | null;
  onPatch: (patch: Record<string, unknown>) => void;
  tone?: "light" | "dark";
};

function patchColorLab(onPatch: Props["onPatch"], value: [number, number, number]) {
  onPatch({ color_json: { space: "lab", value } });
}

export function RegionEditor({ region, onPatch, tone = "light" }: Props) {
  const dark = tone === "dark";
  const readLab = (r: RegionView | null) =>
    (r?.color_json?.value as number[] | undefined) ?? [70, 0, 0];
  if (!region) {
    return <p className={`text-sm ${dark ? "text-white/45" : "text-stone-500"}`}>选择一个区域以编辑</p>;
  }
  const labVals = readLab(region);
  const L = labVals[0] ?? 70;
  const a = labVals[1] ?? 0;
  const b = labVals[2] ?? 0;
  const sp = region.spread_json ?? {};

  const hexForWheel = useMemo(() => {
    try {
      return labToHex(L, a, b);
    } catch {
      return "b4b4b4";
    }
  }, [L, a, b]);

  const onHexFromPicker = (hexNoHash: string) => {
    try {
      const [nL, na, nb] = hexToLab(hexNoHash);
      patchColorLab(onPatch, [nL, na, nb]);
    } catch {
      /* ignore invalid */
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <h3 className={`text-sm font-medium ${dark ? "text-white/85" : "text-stone-800"}`}>区域属性</h3>
      <label className="block">
        <span className={dark ? "text-white/55" : "text-stone-600"}>名称</span>
        <input
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-stone-900"
          value={region.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
      </label>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className={dark ? "text-white/55" : "text-stone-600"}>颜色</span>
          <div
            className="h-6 w-6 shrink-0 rounded border border-stone-300 shadow-inner"
            style={{ backgroundColor: `#${hexForWheel}` }}
            title={`#${hexForWheel}`}
          />
        </div>
        <ColorWheelPicker value={hexForWheel} onChange={onHexFromPicker} brightnessLabel="Brightness" />
        <p className={`mt-2 text-xs ${dark ? "text-white/45" : "text-stone-500"}`}>
          色环选色相与饱和度，下方滑条为明度（与英文标注一致）。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <p className={`col-span-3 text-xs ${dark ? "text-white/45" : "text-stone-500"}`}>LAB 微调（可选）</p>
        <label>
          <span className={`text-xs ${dark ? "text-white/55" : "text-stone-600"}`}>L*</span>
          <input
            type="number"
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-900"
            step={0.1}
            value={L}
            onChange={(e) =>
              patchColorLab(onPatch, [Number(e.target.value) || 0, a, b])
            }
          />
        </label>
        <label>
          <span className={`text-xs ${dark ? "text-white/55" : "text-stone-600"}`}>a*</span>
          <input
            type="number"
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-900"
            step={0.1}
            value={a}
            onChange={(e) =>
              patchColorLab(onPatch, [L, Number(e.target.value) || 0, b])
            }
          />
        </label>
        <label>
          <span className={`text-xs ${dark ? "text-white/55" : "text-stone-600"}`}>b*</span>
          <input
            type="number"
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-900"
            step={0.1}
            value={b}
            onChange={(e) =>
              patchColorLab(onPatch, [L, a, Number(e.target.value) || 0])
            }
          />
        </label>
      </div>

      <label className="block">
        <span className={dark ? "text-white/55" : "text-stone-600"}>强度</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          className="w-full"
          value={region.intensity}
          onChange={(e) => onPatch({ intensity: Number(e.target.value) })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={`text-xs ${dark ? "text-white/55" : "text-stone-600"}`}>spread sx</span>
          <input
            type="number"
            step={0.02}
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-900"
            value={sp.sx ?? 0.3}
            onChange={(e) =>
              onPatch({
                spread_json: { ...sp, sx: Number(e.target.value), sy: sp.sy ?? 0.3 },
              })
            }
          />
        </label>
        <label>
          <span className={`text-xs ${dark ? "text-white/55" : "text-stone-600"}`}>spread sy</span>
          <input
            type="number"
            step={0.02}
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-900"
            value={sp.sy ?? 0.3}
            onChange={(e) =>
              onPatch({
                spread_json: { ...sp, sx: sp.sx ?? 0.3, sy: Number(e.target.value) },
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
