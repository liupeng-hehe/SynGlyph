import Link from "next/link";

export default function SeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex shrink-0 gap-4 border-b border-zinc-700 bg-zinc-950/90 px-6 py-3">
        <Link href="/seed/letters" className="text-sm text-zinc-400 hover:text-white">
          Letters
        </Link>
        <Link href="/seed/words" className="text-sm text-zinc-400 hover:text-white">
          Words
        </Link>
        <Link href="/seed/segments" className="text-sm text-zinc-400 hover:text-white">
          Segments
        </Link>
        <Link href="/seed/review" className="text-sm text-zinc-400 hover:text-white">
          Review
        </Link>
        <Link href="/active" className="text-sm text-zinc-400 hover:text-white">
          Active
        </Link>
        <Link href="/" className="ml-auto text-sm text-zinc-400 hover:text-white">
          Home
        </Link>
      </nav>
      <main className="flex-1 p-6 text-zinc-200">{children}</main>
    </div>
  );
}
