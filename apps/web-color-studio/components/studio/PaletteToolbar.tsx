"use client";

import html2canvas from "html2canvas";
import { toPng } from "html-to-image";

import {
  LETTER_GRID_SCREENSHOT_BOX_PT,
  fitScreenshotContainPts,
  getPngDataUrlNaturalPx,
} from "@/components/studio/pdf/letterGridLayout";
import { trimCanvasSolidBackgroundBottom } from "@/lib/canvasTrim";
import { letterGridExportHeightPx } from "@/lib/domCapture";
import {
  SYN_GRID_EXPORT_BG,
  compositeGridCanvasWithTitleStrip,
  loadCanvasFromPngDataUrl,
} from "@/lib/exportGridTitleBanner";
import type { LetterColor } from "@/lib/types";

type Props = {
  letters: LetterColor[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  onGenerateExample: () => void;
};

export function PaletteToolbar({
  letters,
  gridRef,
  onGenerateExample,
}: Props) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(letters, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synesthetic-letter-palette.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function rasterizeLetterGridToPng(): Promise<string | null> {
    const node = gridRef.current;
    if (!node) return null;
    try {
      if (typeof document !== "undefined" && document.fonts) {
        await document.fonts.ready;
      }
    } catch {
      /* ignore broken font preload */
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );

    const pngScale = 2;
    const captureH = Math.max(1, letterGridExportHeightPx(node));

    /** Shared finish: crop excess cream below grid, stack BYO title strip on top */
    function finishRasterCanvas(c: HTMLCanvasElement): string {
      const trimmed = trimCanvasSolidBackgroundBottom(c, SYN_GRID_EXPORT_BG);
      const withTitle = compositeGridCanvasWithTitleStrip(trimmed, pngScale);
      return withTitle.toDataURL("image/png");
    }

    try {
      /**
       * Let html2canvas size to the subtree; avoid stamping a giant fixed height on the
       * clone (that created a tall #fff band under Y/Z). Trim solid background rows after.
       */
      const canvas = await html2canvas(node, {
        scale: pngScale,
        backgroundColor: SYN_GRID_EXPORT_BG,
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone(_doc, cloned) {
          cloned.style.overflow = "visible";
          /** Clone iframe sometimes gets min-content height; bump only to live scroll box */
          const minH =
            Math.max(node.scrollHeight, node.offsetHeight) + 10;
          cloned.style.minHeight = `${minH}px`;
        },
      });
      return finishRasterCanvas(canvas);
    } catch (err) {
      console.warn("html2canvas export failed; falling back to html-to-image", err);
      /** Height-only avoids stamping width on clone (aspect-ratio reflow vs SVG viewport). */
      const dataUrl = await toPng(node, {
        height: captureH,
        pixelRatio: pngScale,
        cacheBust: true,
        backgroundColor: SYN_GRID_EXPORT_BG,
      });
      const c = await loadCanvasFromPngDataUrl(dataUrl);
      return finishRasterCanvas(c);
    }
  }

  async function exportPdf() {
    const [{ pdf }] = await Promise.all([import("@react-pdf/renderer")]);

    /** Prefer raster (same DOM as PNG) so PDF matches screenshot; vector fallback only if raster fails */
    try {
      const pngDataUrl = await rasterizeLetterGridToPng();
      if (pngDataUrl) {
        const { w: pxW, h: pxH } = await getPngDataUrlNaturalPx(pngDataUrl);
        const { widthPt, heightPt } = fitScreenshotContainPts(
          LETTER_GRID_SCREENSHOT_BOX_PT.width,
          LETTER_GRID_SCREENSHOT_BOX_PT.height,
          pxW,
          pxH,
        );
        const { LetterGridRasterDocument } = await import(
          "@/components/studio/pdf/LetterGridRasterDocument"
        );
        const blob = await pdf(
          <LetterGridRasterDocument
            pngDataUrl={pngDataUrl}
            imageWidthPt={widthPt}
            imageHeightPt={heightPt}
          />,
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "synesthetic-letter-cards.pdf";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch (e) {
      console.warn("Letter grid raster PDF failed, using vector fallback", e);
    }

    const { LetterGridDocument } = await import(
      "@/components/studio/pdf/LetterGridDocument",
    );
    const blob = await pdf(<LetterGridDocument letters={letters} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synesthetic-letter-cards.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng() {
    const dataUrl = await rasterizeLetterGridToPng();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "synesthetic-letter-cards.png";
    a.click();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-byo-ink/15 pb-4">
      <button
        type="button"
        onClick={onGenerateExample}
        className="rounded-full bg-byo-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90"
      >
        Generate example palette
      </button>
      <button
        type="button"
        onClick={exportJson}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
      >
        Export JSON
      </button>
      <button
        type="button"
        onClick={exportPdf}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
      >
        Export PDF
      </button>
      <button
        type="button"
        onClick={exportPng}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
      >
        Export PNG
      </button>
    </div>
  );
}
