import type { PdfDocumentSettings } from "@/lib/colorStudio/types";

/** Page size in PDF points (react-pdf). */
export function pdfPageSizePt(settings: PdfDocumentSettings): {
  width: number;
  height: number;
} {
  if (settings.pageSize === "Letter") {
    return { width: 612, height: 792 };
  }
  return { width: 595.28, height: 841.89 };
}

export function pdfContentRect(settings: PdfDocumentSettings): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const page = pdfPageSizePt(settings);
  const { margins } = settings;
  const width = page.width - margins.left - margins.right;
  const height = page.height - margins.top - margins.bottom - 22;
  return {
    x: margins.left,
    y: margins.top,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}
