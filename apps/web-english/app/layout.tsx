import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import LayoutBg from "@/components/LayoutBg";
import "./globals.css";

const caveat = Caveat({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: "SynGlyph",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${caveat.variable} font-sans text-zinc-100 antialiased`}>
        <LayoutBg>{children}</LayoutBg>
      </body>
    </html>
  );
}
