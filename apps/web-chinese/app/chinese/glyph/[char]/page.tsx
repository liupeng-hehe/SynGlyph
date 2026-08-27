"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { fetchChineseGlyph } from "@/lib/apiChinese";
import { GlyphCanvas } from "@/components/chinese/GlyphCanvas";
import { strokeFillsFromTemplate } from "@/lib/glyphStrokeColors";

export default function ChineseGlyphPreviewPage() {
  const params = useParams();
  const raw = params.char as string;
  const char = decodeURIComponent(raw);
  const [err, setErr] = useState<string | null>(null);
  const [tpl, setTpl] = useState<Awaited<ReturnType<typeof fetchChineseGlyph>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChineseGlyph(char)
      .then((t) => {
        if (!cancelled) setTpl(t);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [char]);

  const strokeFills = useMemo(() => {
    if (!tpl) return [];
    return strokeFillsFromTemplate(tpl.template);
  }, [tpl]);

  if (err) {
    return (
      <main className="p-8">
        <p className="text-amber-800">{err}</p>
        <a href="/chinese" className="mt-4 inline-block text-sky-700 underline">
          返回
        </a>
      </main>
    );
  }

  if (!tpl) {
    return <p className="p-8 text-stone-600">加载…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">字形预览 · {tpl.template.character}</h1>
      <p className="mb-2 text-sm text-stone-600">分解：{tpl.template.decomposition ?? "—"}</p>
      <GlyphCanvas
        medians={tpl.template.medians}
        strokes={tpl.template.strokes}
        strokeFills={strokeFills}
        variant="paper"
        viewRegions={[]}
        transitions={[]}
        interactionMode="idle"
        previewMode="structure"
        selectedStrokeIds={[]}
        selectedRegionId={null}
        showAnchors={false}
        onStrokeClick={() => {}}
      />
    </main>
  );
}
