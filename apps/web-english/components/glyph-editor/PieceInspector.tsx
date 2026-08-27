"use client";

import type {
  CoarsePrimitiveLabel,
  OpeningDir,
  OrientationClass,
  PieceAnnotationV2,
  SideInGlyph,
  VerticalInGlyph,
} from "@/lib/glyph-editor/glyphSchema";

const LABELS: CoarsePrimitiveLabel[] = [
  "line",
  "arc",
  "loop",
  "hook",
  "diagonal",
  "unknown",
];
const SIDES: SideInGlyph[] = ["left", "right", "center", "mixed"];
const VERT_BANDS: VerticalInGlyph[] = ["top", "middle", "bottom", "mixed"];
const OPENINGS: OpeningDir[] = ["left", "right", "up", "down", "none"];

/** 直线笔画：竖 / 横 / 斜（写入 orientation） */
const LINE_ORIENTS: OrientationClass[] = ["vertical", "horizontal", "diagonal"];

function lineOrientationValue(o: OrientationClass): OrientationClass {
  return LINE_ORIENTS.includes(o) ? o : "vertical";
}

type Props = {
  piece: PieceAnnotationV2 | null;
  onChange: (p: PieceAnnotationV2) => void;
};

export function PieceInspector({ piece, onChange }: Props) {
  if (!piece) {
    return (
      <div className="rounded border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        在<strong className="text-zinc-300">选择</strong>模式下点击部件着色区域以选中；开启<strong className="text-zinc-300">分解视图</strong>
        后可拖动部件。
      </div>
    );
  }

  const set = (patch: Partial<PieceAnnotationV2>) => onChange({ ...piece, ...patch });

  const showOpening = piece.label_final === "arc" || piece.label_final === "hook";

  const field =
    "mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-zinc-100 [&>option]:bg-zinc-900";

  return (
    <div className="space-y-3 rounded border border-zinc-700 bg-zinc-900/80 p-4 text-sm text-zinc-200 shadow-lg shadow-black/30">
      <h3 className="font-medium text-white">部件 {piece.piece_id}</h3>

      <div>
        <label className="block text-zinc-500">程序建议</label>
        <div className="text-zinc-200">
          {piece.label_suggested}
          {piece.confidence != null && (
            <span className="ml-2 text-zinc-500">({piece.confidence.toFixed(2)})</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-zinc-500">最终类型（粗粒度）</label>
        <select
          className={field}
          value={piece.label_final}
          onChange={(e) => {
            const label_final = e.target.value as CoarsePrimitiveLabel;
            const next: Partial<PieceAnnotationV2> = { label_final };
            if (label_final !== "arc" && label_final !== "hook") {
              next.opening_dir = "none";
            }
            onChange({ ...piece, ...next });
          }}
        >
          {LABELS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {piece.label_final === "line" && (
        <div>
          <label className="block text-zinc-500">直线方向</label>
          <select
            className={field}
            value={lineOrientationValue(piece.orientation)}
            onChange={(e) =>
              set({ orientation: e.target.value as OrientationClass })
            }
          >
            <option value="vertical">vertical（竖画）</option>
            <option value="horizontal">horizontal（横画）</option>
            <option value="diagonal">diagonal（斜画）</option>
          </select>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            默认由<strong className="text-zinc-400">骨架两端点</strong>连线方向自动判定（竖/横/斜）；与「走向」同源，写入 orientation。
          </p>
        </div>
      )}

      <div>
        <label className="block text-zinc-500">左右位置（自动）</label>
        <select
          className={field}
          value={piece.side_in_glyph}
          onChange={(e) => set({ side_in_glyph: e.target.value as SideInGlyph })}
        >
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          仅竖切分时按 centroid 从左到右标为左/中/右（两刀之间为「中」）。
        </p>
      </div>

      <div>
        <label className="block text-zinc-500">上下位置（自动）</label>
        <select
          className={field}
          value={piece.vertical_in_glyph ?? "middle"}
          onChange={(e) => set({ vertical_in_glyph: e.target.value as VerticalInGlyph })}
        >
          {VERT_BANDS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          默认用 centroid 相对<strong className="text-zinc-400">田字格水平中线</strong>（画布高一半）判上/中/下；纯横切分时也会按部件上下顺序标带。
        </p>
      </div>

      {showOpening ? (
        <div>
          <label className="block text-zinc-500">开口方向（建议）</label>
          <select
            className={field}
            value={piece.opening_dir}
            onChange={(e) => set({ opening_dir: e.target.value as OpeningDir })}
          >
            {OPENINGS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">当前类型不强调开口方向</p>
      )}

      <div>
        <label className="block text-zinc-500">走向（自动）</label>
        <div className="font-mono text-xs text-zinc-300">{piece.orientation}</div>
      </div>

      <div>
        <label className="block text-zinc-500">原始 centroid (norm)</label>
        <div className="font-mono text-xs text-zinc-300">
          [{piece.original_centroid[0].toFixed(4)}, {piece.original_centroid[1].toFixed(4)}]
        </div>
      </div>
      <div>
        <label className="block text-zinc-500">分解偏移 offset (norm)</label>
        <div className="font-mono text-xs text-zinc-300">
          dx={piece.offset_dx.toFixed(4)}, dy={piece.offset_dy.toFixed(4)}
        </div>
      </div>
      <div>
        <label className="block text-zinc-500">bbox_piece</label>
        <div className="font-mono text-xs text-zinc-300">
          [{piece.bbox_piece.map((x) => x.toFixed(3)).join(", ")}]
        </div>
      </div>

      <div>
        <label className="block text-zinc-500">notes</label>
        <textarea
          className={`${field} text-xs`}
          rows={3}
          value={piece.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
