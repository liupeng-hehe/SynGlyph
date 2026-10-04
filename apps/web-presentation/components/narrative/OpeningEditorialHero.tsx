"use client";

import Link from "next/link";
import { useState } from "react";

import { SynGlyphDotTitle } from "@/components/hero/SynGlyphDotTitle";
import type { Chapter } from "@/content/synesthesiaContent";

import { useSmoothScroll } from "./SmoothScrollProvider";

type Props = {
  chapter: Chapter;
};

export function OpeningEditorialHero({ chapter }: Props) {
  const scroll = useSmoothScroll();
  const [exploreOpen, setExploreOpen] = useState(false);

  return (
    <section
      id={chapter.id}
      data-snap-section
      className="opening-editorial wordblue-hero scroll-mt-0 min-h-[100svh]"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="wordblue-hero__shell">
        <header className="wordblue-hero__topbar">
          <a
            href="#opening"
            className="wordblue-hero__brand font-body"
            aria-label="SynGlyph"
            onClick={(event) => {
              event.preventDefault();
              scroll?.scrollTo("opening");
            }}
          >
            <span className="wordblue-hero__logo" aria-hidden="true" />
          </a>
          <div className="wordblue-hero__topbar-actions">
            <div className="wordblue-hero__explore-wrap">
              <button
                type="button"
                className="wordblue-hero__explore font-body"
                aria-expanded={exploreOpen}
                aria-haspopup="true"
                onClick={() => setExploreOpen((open) => !open)}
              >
                Explore
              </button>
              {exploreOpen ? (
                <div className="wordblue-hero__explore-menu" role="menu">
                  <Link href="/gallery" className="wordblue-hero__explore-link font-body" role="menuitem">
                    Archive
                  </Link>
                  <Link
                    href="/build-your-own/colorrec"
                    className="wordblue-hero__explore-link font-body"
                    role="menuitem"
                  >
                    Color studio
                  </Link>
                </div>
              ) : null}
            </div>
            <span className="wordblue-hero__menu-icon" aria-hidden>
              <span />
              <span />
            </span>
          </div>
        </header>

        <div className="wordblue-hero__main">
          <div className="wordblue-hero__title-wrap">
            <h1 id={`${chapter.id}-title`} className="sr-only">
              SYNGLYPH
            </h1>
            <SynGlyphDotTitle />
          </div>
        </div>
      </div>
    </section>
  );
}
