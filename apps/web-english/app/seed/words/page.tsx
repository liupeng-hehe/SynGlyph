"use client";

import { useState } from "react";
import Link from "next/link";
import { bootstrapImport, getImportStatus } from "@/lib/api";

export default function SeedWordsPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ status: string; created?: number; skipped?: number } | null>(null);

  async function handleBootstrap() {
    setLoading(true);
    setMessage("");
    try {
      const result = await bootstrapImport();
      setStatus(result);
      setMessage(`Imported ${result.created ?? 0} words (${result.skipped ?? 0} already existed)`);
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshStatus() {
    const s = await getImportStatus();
    setStatus(s);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute left-4 top-4">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">← Home</Link>
      </div>
      <h1 className="text-2xl font-semibold text-white/90">Word pool selection</h1>
      <p className="mt-2 text-sm text-white/60">Bootstrap import: fetch common English words, compute coverage features, greedy select ~150 seed words.</p>
      <div className="mt-6 flex flex-col gap-4">
        <button
          onClick={handleBootstrap}
          disabled={loading}
          className="w-fit rounded-full bg-sky-600 px-8 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Importing..." : "Run bootstrap import"}
        </button>
        <button
          onClick={handleRefreshStatus}
          className="w-fit rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
        >
          Refresh status
        </button>
        {status && (
          <pre className="rounded-2xl border border-white/20 bg-[#1a1a24] p-4 text-sm text-white/80">{JSON.stringify(status, null, 2)}</pre>
        )}
        {message && <p className="text-sm text-white/70">{message}</p>}
      </div>
      <Link href="/seed/segments" className="mt-6 rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Next: Segments →</Link>
    </div>
  );
}
