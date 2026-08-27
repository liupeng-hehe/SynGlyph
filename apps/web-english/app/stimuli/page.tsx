"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createStimulus } from "@/lib/api";

export default function StimuliPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("en");
  const [sourceType, setSourceType] = useState("manual");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setMessage("Please enter text");
      return;
    }
    if (!/^[a-zA-Z\s-]+$/.test(text.trim())) {
      setMessage("Text should be alphabetic (letters, spaces, hyphens)");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await createStimulus({
        text: text.trim(),
        language,
        source_type: sourceType,
      });
      setMessage("Created");
      setText("");
      router.push("/");
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">
          ← Home
        </Link>
        <span className="text-zinc-600">|</span>
        <Link href="/stimuli/bulk" className="text-sm text-sky-400 hover:text-sky-300">
          Bulk import
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">Create stimulus</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-400">Text (e.g. distance)</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="distance"
            className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-400">Language</label>
          <input
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-400">Source type</label>
          <input
            type="text"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-sky-600 px-4 py-2 text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {message && <p className="text-sm text-zinc-400">{message}</p>}
    </div>
  );
}
