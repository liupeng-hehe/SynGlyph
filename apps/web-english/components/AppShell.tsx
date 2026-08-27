"use client";

import DotGrid from "./DotGrid";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-y-auto">
      <div
        className="fixed inset-0 -z-10"
        style={{ width: "100%", height: "100%", minHeight: "100vh" }}
      >
        <DotGrid
          dotSize={5}
          gap={15}
          baseColor="#271E37"
          activeColor="#5227FF"
          proximity={120}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
        />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}
