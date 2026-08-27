"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Fixed cream for the exhibition nav bar (matches presentation paper). */
const EXHIBITION_NAV_BAR = "#FFF8E7";

const links = [
  { href: "/", label: "Blue Lexicon" },
  { href: "/build-your-own", label: "Build Your Own" },
  { href: "/reading", label: "Reading" },
  { href: "/atlas", label: "Atlas" },
  { href: "/gallery", label: "Gallery" },
] as const;

export function ExhibitionNav() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    <header
      className="border-b border-stone-200/40"
      style={{ backgroundColor: EXHIBITION_NAV_BAR }}
    >
      <nav
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-6 px-6 py-4 md:gap-10 md:px-10 md:py-5"
        aria-label="Exhibition"
      >
        <Link
          href="/"
          className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-50 focus:rounded focus:px-2 focus:py-1 focus:font-body focus:text-sm focus:text-foyer-ink"
          style={{ backgroundColor: EXHIBITION_NAV_BAR }}
        >
          Exhibition home
        </Link>
        <ul className="m-0 flex list-none flex-wrap justify-center gap-8 p-0 md:gap-12">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="font-body text-[13px] tracking-wide text-foyer-muted transition-colors hover:text-foyer-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-foyer-accent/30 focus-visible:ring-offset-2"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
