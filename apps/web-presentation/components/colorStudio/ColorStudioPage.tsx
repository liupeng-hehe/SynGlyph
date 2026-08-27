"use client";

import { StudioShell } from "@/components/colorStudio/StudioShell";
import { BYO_BG } from "@/lib/colorStudio/byoTheme";
import { StudioProvider } from "@/lib/colorStudio/studioContext";

type Props = {
  profileId: string | null;
  displayName: string | null;
};

export function ColorStudioPage({ profileId, displayName }: Props) {
  return (
    <main className="min-h-[calc(100vh-4rem)]" style={{ background: BYO_BG, color: "#002FA7" }}>
      <StudioProvider byoProfileId={profileId} byoDisplayName={displayName}>
        <StudioShell />
      </StudioProvider>
    </main>
  );
}
