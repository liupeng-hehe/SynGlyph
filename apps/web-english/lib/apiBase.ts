/**
 * Single source of truth for the public API origin.
 * Set NEXT_PUBLIC_API_URL in staging/production (no localhost in built assets).
 */
export function getPublicApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw && raw.trim()) {
    return raw.trim().replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}
