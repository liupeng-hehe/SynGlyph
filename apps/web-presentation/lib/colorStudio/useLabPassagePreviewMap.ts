"use client";

import { useEffect, useState } from "react";

import type { LabRenderToken } from "@/lib/colorStudio/passageRender";
import type { PassageTextBox } from "@/lib/colorStudio/types";

export function useLabPassagePreviewMap(
  profileId: string | null,
  boxes: PassageTextBox[],
): { tokensByBoxId: Record<string, LabRenderToken[] | null>; loading: boolean } {
  const [tokensByBoxId, setTokensByBoxId] = useState<
    Record<string, LabRenderToken[] | null>
  >({});
  const [loading, setLoading] = useState(false);

  const serialized = boxes
    .map((b) => `${b.id}:${b.text}`)
    .join("|");

  useEffect(() => {
    if (!profileId) {
      setTokensByBoxId({});
      setLoading(false);
      return;
    }

    const active = boxes.filter((b) => b.text.trim());
    if (!active.length) {
      setTokensByBoxId({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        const next: Record<string, LabRenderToken[] | null> = {};
        try {
          await Promise.all(
            active.map(async (box) => {
              try {
                const r = await fetch("/api/lab/preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    profile_id: profileId,
                    mode: "free_text",
                    text: box.text.trim(),
                  }),
                });
                if (!r.ok) throw new Error(String(r.status));
                const data = (await r.json()) as { tokens?: LabRenderToken[] };
                next[box.id] = data.tokens ?? null;
              } catch {
                next[box.id] = null;
              }
            }),
          );
          if (!cancelled) setTokensByBoxId(next);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profileId, serialized]);

  return { tokensByBoxId, loading };
}
