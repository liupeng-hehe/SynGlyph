import { buildLetterColor } from "@/lib/colorStudio/colorUtils";
import type { LetterColor } from "@/lib/colorStudio/types";

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type ByoHandoffPayload = {
  v: 1;
  name?: string;
  profileId?: string;
  hex: Record<string, string>;
};

type LabLetterRow = {
  color?: string;
  prominence?: number;
  spread?: number;
};

function base64UrlDecode(token: string): string {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  if (typeof atob === "function") return atob(pad);
  return Buffer.from(pad, "base64").toString("utf8");
}

export function decodeByoHandoff(token: string): ByoHandoffPayload | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(token)) as ByoHandoffPayload;
    if (parsed?.v !== 1 || !parsed.hex || typeof parsed.hex !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function lettersFromProfileRows(
  letters: Record<string, LabLetterRow>,
): LetterColor[] {
  return AZ.map((ch) => {
    const row = letters[ch.toLowerCase()] ?? letters[ch];
    return buildLetterColor(ch, row?.color ?? "#4a5dff", "imported", {
      prominence: row?.prominence,
      spread: row?.spread,
    });
  });
}

export function lettersFromByoHandoff(payload: ByoHandoffPayload): LetterColor[] | null {
  try {
    return AZ.map((ch) => {
      const v = payload.hex[ch] ?? payload.hex[ch.toLowerCase()];
      if (typeof v !== "string") throw new Error("missing hex");
      return buildLetterColor(ch, v, "imported");
    });
  } catch {
    return null;
  }
}

type LabProfileState = {
  display_name?: string;
  letters?: Record<string, LabLetterRow>;
};

export async function fetchByoHandoffFromProfile(
  profileId: string,
): Promise<{ payload: ByoHandoffPayload; letters: LetterColor[] } | null> {
  const r = await fetch(
    `/api/lab/profile/state?profile_id=${encodeURIComponent(profileId)}`,
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { profile?: LabProfileState };
  const profile = data.profile;
  if (!profile?.letters) return null;
  const hex: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(97 + i);
    hex[c] = profile.letters[c]?.color ?? "#4a5dff";
  }
  const payload: ByoHandoffPayload = {
    v: 1,
    name: profile.display_name,
    profileId,
    hex,
  };
  const letters = lettersFromProfileRows(profile.letters);
  return { payload, letters };
}
