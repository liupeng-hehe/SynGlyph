import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SynGlyph · Chinese Annotation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
