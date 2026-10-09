"use client";

import Link from "next/link";

import { useSmoothScroll } from "./SmoothScrollProvider";

export function ClosingCodaSection() {
  const scroll = useSmoothScroll();

  return (
    <section
      id="coda"
      data-snap-section
      data-nav-theme="dark"
      className="closing-coda narrative-chapter scroll-mt-0"
      aria-labelledby="coda-title"
    >
      <div className="closing-coda__inner">
        <p className="closing-coda__kicker m-0 font-body">After the last figure</p>
        <h2 id="coda-title" className="closing-coda__title m-0 font-body">
          The color is not on the page.
        </h2>
        <p className="closing-coda__body m-0 font-body">
          It exists between what is seen and what is felt.
          <span className="closing-coda__break">Begin again — or look a little further.</span>
        </p>
        <div className="closing-coda__actions">
          <button
            type="button"
            className="closing-coda__action font-body"
            onClick={() => scroll?.scrollTo("opening")}
          >
            Begin again
          </button>
          <Link href="/build-your-own/colorrec" className="closing-coda__action font-body">
            Color studio
          </Link>
        </div>
      </div>
    </section>
  );
}
