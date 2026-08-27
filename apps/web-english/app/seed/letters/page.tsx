"use client";

import Link from "next/link";

export default function SeedLettersPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute left-4 top-4">
        <Link href="/" className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">← Home</Link>
      </div>
      <h1 className="text-2xl font-semibold text-white/90">Letter-level seed</h1>
      <p className="mt-2 text-sm text-white/60">Single characters or minimal units for letter-level annotation.</p>
      <p className="mt-4 text-sm text-white/50">Coming soon: letter-level annotation workflow.</p>
      <Link href="/seed/words" className="mt-6 rounded-full border border-white/30 px-4 py-2 text-sm text-white/90 hover:bg-white/10">Next: Words →</Link>
    </div>
  );
}
