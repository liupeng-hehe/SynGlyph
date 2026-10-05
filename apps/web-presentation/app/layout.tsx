import type { Metadata } from "next";
import localFont from "next/font/local";

import { ExhibitionNav } from "@/components/ui/ExhibitionNav";

import "./globals.css";

const display = localFont({
  src: "./fonts/Fraunces-latin-wght.woff2",
  variable: "--font-display",
  weight: "400 700",
  display: "swap",
});

const body = localFont({
  src: "./fonts/DMSans-latin-wght.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});

/** Newsreader: page 2 and Now, Mine reading text. */
const prose = localFont({
  src: "./fonts/Newsreader-latin-wght.woff2",
  variable: "--font-prose",
  weight: "200 400",
  display: "swap",
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
        className={`${display.variable} ${body.variable} ${prose.variable} min-h-screen font-body antialiased`}
        style={{ backgroundColor: "#fffcf7", color: "#002fa7" }}
      >
        <ExhibitionNav />
        {children}
      </body>
    </html>
  );
}
