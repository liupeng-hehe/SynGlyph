"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

const PdfViewerClient = dynamic(() => import("./PdfViewerClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-xl border border-dashed border-byo-ink/25 bg-white/50 text-sm text-byo-ink/65">
      Loading PDF preview…
    </div>
  ),
});

export function PdfPreview({ document }: { document: ReactElement }) {
  return <PdfViewerClient>{document}</PdfViewerClient>;
}
