"use client";

import { PDFViewer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export default function PdfViewerClient({
  children,
}: {
  children: ReactElement;
}) {
  return (
    <PDFViewer
      showToolbar
      style={{
        width: "100%",
        height: 560,
        borderRadius: 12,
        border: "1px solid rgba(0,47,167,0.18)",
      }}
    >
      {children}
    </PDFViewer>
  );
}
