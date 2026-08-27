import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";

import { ExhibitionNav } from "@/components/ui/ExhibitionNav";

import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "When Words Turn Blue",
  description:
    "Not all words remain black and white; some carry color before they are understood.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} min-h-screen font-body antialiased`}
        style={{ backgroundColor: "#fffcf7", color: "#002fa7" }}
      >
        <ExhibitionNav />
        {children}
      </body>
    </html>
  );
}
