"use client";

import { useEffect, useState } from "react";

/**
 * Debug UI for exhibition (viewpoint pills, captions, API errors).
 * Enable with `NEXT_PUBLIC_EXHIBITION_DEBUG=1` or `?debug=1`.
 */
export function useExhibitionDebug(): boolean {
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    const env =
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_EXHIBITION_DEBUG === "1";
    const q =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1";
    setDebug(Boolean(env || q));
  }, []);

  return debug;
}
