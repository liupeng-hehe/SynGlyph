"use client";

type RawJsonDrawerProps = {
  /** Raw API payload (object or array). Omit or null to hide. */
  value: unknown;
  title?: string;
};

export function RawJsonDrawer({ value, title = "Raw API response" }: RawJsonDrawerProps) {
  if (value === undefined || value === null) return null;
  return (
    <details className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 text-left">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-400">
        {title}
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-zinc-800 p-3 text-xs leading-relaxed text-zinc-400">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
