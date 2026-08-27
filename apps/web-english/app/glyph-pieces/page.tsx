import Link from "next/link";
import { GlyphPieceEditor } from "@/components/glyph-editor/GlyphPieceEditor";

export default function GlyphPiecesPage() {
  return (
    <div className="min-h-screen p-4 text-zinc-100">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-white">字形部件编辑器</h1>
          <p className="text-xs text-zinc-400">
            直线切割掩码 → 连通块部件；分解视图拖动；田字格参考；规则建议粗标签；保存 JSON v2
          </p>
        </div>
        <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 hover:underline">
          返回首页
        </Link>
      </header>
      <GlyphPieceEditor initialGlyph="a" />
    </div>
  );
}
