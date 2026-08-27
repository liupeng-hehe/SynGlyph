"use client";

import { GrainientBg } from "./GrainientBg";

export default function LayoutBg({ children }: { children: React.ReactNode }) {
  return (
    <GrainientBg className="min-h-screen">
      <div className="flex min-h-screen flex-col p-6">{children}</div>
    </GrainientBg>
  );
}
