"use client";

import { useMemo } from "react";

import {
  cssStripeGradient,
  stripesFromPassageGlyphs,
  type PassageStripeSpec,
} from "@/lib/colorStudio/passageStripes";
import type { PassageGlyph } from "@/lib/colorStudio/passageRender";

type Props = {
  glyphs: PassageGlyph[];
  backgroundHex: string;
  llmStripes?: PassageStripeSpec | null;
};

export function PassageStripeWash({ glyphs, backgroundHex, llmStripes }: Props) {
  const spec = useMemo(() => {
    if (llmStripes && llmStripes.bands.length >= 2) return llmStripes;
    return stripesFromPassageGlyphs(glyphs, backgroundHex);
  }, [glyphs, backgroundHex, llmStripes]);

  const gradient = useMemo(() => cssStripeGradient(spec), [spec]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
      aria-hidden
    >
      <div
        className="absolute inset-[-20%]"
        style={{
          backgroundImage: gradient,
          backgroundSize: `${spec.periodPx}px ${spec.periodPx}px`,
          opacity: 0.95,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 70% at 50% 42%, transparent 0%, rgba(255,255,255,0.35) 100%)",
        }}
      />
    </div>
  );
}
