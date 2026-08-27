"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkImportStimuli } from "@/lib/api";

export default function BulkImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setMessage("Please paste some text");
      return;
    }
    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const r = await bulkImportStimuli(text.trim());
      setResult({ created: r.created, skipped: r.skipped });
      setMessage(`Imported: ${r.created} new, ${r.skipped} already existed`);
      setText("");
      if (r.created > 0) {
        setTimeout(() => router.push("/"), 1500);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/stimuli" className="text-sm text-zinc-400 hover:text-white">
          ← Create single
        </Link>
        <span className="text-zinc-600">|</span>
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">
          Home
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">Bulk import</h1>
      <p className="text-sm text-zinc-400">
        Paste English text. Words will be extracted and imported (duplicates skipped).
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-400">Paste text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="The quick brown fox jumps over the lazy dog..."
            rows={8}
            className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-sky-600 px-4 py-2 text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import"}
        </button>
      </form>

      {message && <p className="text-sm text-zinc-400">{message}</p>}
      {result && result.created > 0 && (
        <p className="text-sm text-emerald-400">
          Redirecting to home...
        </p>
      )}
    </div>
  );
}
