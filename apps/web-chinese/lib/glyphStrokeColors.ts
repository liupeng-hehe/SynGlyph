import type { ChineseGlyphResponse } from "@/lib/apiChinese";
import { labColorFromJson } from "@/lib/labColor";

export type RegionViewLike = {
  stroke_ids_json: number[] | null;
  color_json: { space?: string; value?: number[] };
};

/** 部首笔画蓝、其余绿（需数据含 rad_strokes，如 Hanzi Writer） */
export function strokeFillsFromTemplate(t: ChineseGlyphResponse["template"]): string[] {
  const rad = t.rad_strokes;
  if (!rad || !Array.isArray(rad)) {
    return t.strokes.map(() => "#44403c");
  }
  const left = new Set(rad.map((x) => Number(x)));
  return t.strokes.map((_, i) => (left.has(i) ? "#1d4ed8" : "#15803d"));
}

function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/**
 * 与英文 segment 着色类似：按区域覆盖笔画颜色。
 * 若某笔画落在多个区域中，后遍历到的区域覆盖前者。
 */
export function mergeStrokeFillsFromRegions(
  baseFills: string[],
  regions: RegionViewLike[]
): string[] {
  const out = [...baseFills];
  for (const r of regions) {
    const ids = r.stroke_ids_json ?? [];
    if (ids.length === 0) continue;
    const rgb = labColorFromJson(r.color_json);
    const fill = rgbCss(rgb);
    for (const id of ids) {
      if (typeof id === "number" && id >= 0 && id < out.length) {
        out[id] = fill;
      }
    }
  }
  return out;
}
