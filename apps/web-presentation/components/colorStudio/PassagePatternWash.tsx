"use client";

import { useMemo } from "react";

import {
  invitationPatternCss,
  type PatternKind,
} from "@/lib/colorStudio/passagePattern";

type Props = {
  backgroundHex: string;
  kind?: PatternKind;
};

export function PassagePatternWash({ backgroundHex, kind = "grid" }: Props) {
  const pattern = useMemo(
    () => invitationPatternCss(backgroundHex, kind),
    [backgroundHex, kind],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundColor: backgroundHex,
        backgroundImage: pattern.backgroundImage,
        backgroundSize: pattern.backgroundSize,
        backgroundPosition: pattern.backgroundPosition ?? "0 0",
      }}
    />
  );
}
