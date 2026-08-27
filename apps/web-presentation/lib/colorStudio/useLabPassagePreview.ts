"use client";

import { useEffect, useState } from "react";

import type { LabRenderToken } from "@/lib/colorStudio/passageRender";

export function useLabPassagePreview(
  profileId: string | null,
  passage: string,
): { tokens: LabRenderToken[] | null; loading: boolean } {
  const [tokens, setTokens] = useState<LabRenderToken[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const text = passage.trim();
    if (!profileId || !text) {
      setTokens(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch("/api/lab/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile_id: profileId,
              mode: "free_text",
              text,
            }),
          });
          if (!r.ok) throw new Error(String(r.status));
          const data = (await r.json()) as { tokens?: LabRenderToken[] };
          if (!cancelled) setTokens(data.tokens ?? null);
        } catch {
          if (!cancelled) setTokens(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profileId, passage]);

  return { tokens, loading };
}
