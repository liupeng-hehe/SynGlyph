"use client";

import html2canvas from "html2canvas";
import { toPng } from "html-to-image";

import {
  LETTER_GRID_SCREENSHOT_BOX_PT,
  fitScreenshotContainPts,
  getPngDataUrlNaturalPx,
} from "@/components/colorStudio/pdf/letterGridLayout";
import { trimCanvasSolidBackgroundBottom } from "@/lib/colorStudio/canvasTrim";
import { letterGridExportHeightPx } from "@/lib/colorStudio/domCapture";
import {
  SYN_GRID_EXPORT_BG,
  compositeGridCanvasWithTitleStrip,
  loadCanvasFromPngDataUrl,
} from "@/lib/colorStudio/exportGridTitleBanner";
import { prepareLetterCardFootersForRasterExport } from "@/lib/colorStudio/letterCardFooter";
import {
  cleanupLetterGridExportPrep,
  prepareLetterGridForRasterExport,
} from "@/lib/colorStudio/letterGridExportPrep";
import type { LetterColor } from "@/lib/colorStudio/types";

type Props = {
  letters: LetterColor[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
  onGenerateExample: () => void;
};

export function PaletteToolbar({
  letters,
  gridRef,
  loading = false,
  onGenerateExample,
}: Props) {
  function exportJson() {
    if (loading) return;
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

    await prepareLetterGridForRasterExport(node);

    try {
      /** Shared finish: crop excess cream below grid, stack BYO title strip on top */
      function finishRasterCanvas(c: HTMLCanvasElement): string {
        const trimmed = trimCanvasSolidBackgroundBottom(c, SYN_GRID_EXPORT_BG);
        const withTitle = compositeGridCanvasWithTitleStrip(trimmed, pngScale);
        return withTitle.toDataURL("image/png");
      }

      try {
        const dataUrl = await toPng(node, {
          height: captureH,
          pixelRatio: pngScale,
          cacheBust: true,
          backgroundColor: SYN_GRID_EXPORT_BG,
        });
        const c = await loadCanvasFromPngDataUrl(dataUrl);
        return finishRasterCanvas(c);
      } catch (err) {
        console.warn("html-to-image export failed; falling back to html2canvas", err);
      }

      const canvas = await html2canvas(node, {
        scale: pngScale,
        backgroundColor: SYN_GRID_EXPORT_BG,
        useCORS: true,
        allowTaint: true,
        logging: false,
        height: captureH,
        windowHeight: captureH,
        onclone(_doc, cloned) {
          cloned.style.overflow = "visible";
          cloned.style.minHeight = `${captureH}px`;
          prepareLetterCardFootersForRasterExport(cloned);
        },
      });
      return finishRasterCanvas(canvas);
    } catch (err) {
      console.warn("html2canvas export failed", err);
      return null;
    } finally {
      cleanupLetterGridExportPrep(node);
    }
  }

  async function exportPdf() {
    if (loading) return;
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
          "@/components/colorStudio/pdf/LetterGridRasterDocument"
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
      "@/components/colorStudio/pdf/LetterGridDocument",
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
    if (loading) return;
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
        disabled={loading}
        onClick={onGenerateExample}
        className="rounded-full bg-byo-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Generate example palette
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={exportJson}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Export JSON
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={exportPdf}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Export PDF
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={exportPng}
        className="rounded-full bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Export PNG
      </button>
    </div>
  );
}
