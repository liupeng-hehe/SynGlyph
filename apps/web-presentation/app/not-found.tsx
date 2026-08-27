import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[50vh] bg-foyer-paper px-6 py-20 text-center">
      <p className="font-body text-sm text-foyer-muted">This room is empty.</p>
      <p className="mt-6">
        <Link
          href="/"
          className="font-body text-sm text-foyer-ink underline decoration-stone-300 underline-offset-4"
        >
          Return to the foyer
        </Link>
      </p>
    </main>
  );
}
