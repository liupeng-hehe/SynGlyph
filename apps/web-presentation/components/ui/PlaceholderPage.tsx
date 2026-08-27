import Link from "next/link";

type Props = {
  title: string;
  kicker: string;
  children?: React.ReactNode;
};

export function PlaceholderPage({ title, kicker, children }: Props) {
  return (
    <main className="min-h-[70vh] bg-foyer-paper px-6 py-14 md:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-body text-xs font-medium uppercase tracking-[0.22em] text-foyer-muted">
          {kicker}
        </p>
        <h1 className="mt-3 font-display text-3xl font-light text-foyer-ink md:text-4xl">
          {title}
        </h1>
        <div className="mt-8 font-body text-sm leading-relaxed text-foyer-muted">
          {children ?? (
            <p>
              This room is reserved for a later pass of the presentation. The
              training workbench remains separate.
            </p>
          )}
        </div>
        <p className="mt-10">
          <Link
            href="/"
            className="font-body text-sm text-foyer-ink underline decoration-stone-300 underline-offset-4 hover:decoration-foyer-ink"
          >
            Back to foyer
          </Link>
        </p>
      </div>
    </main>
  );
}
