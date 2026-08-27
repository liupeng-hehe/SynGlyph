"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { Chapter } from "@/content/synesthesiaContent";

import { useSmoothScroll } from "./SmoothScrollProvider";

type Props = {
  chapter: Chapter;
};

function HeroGeometry() {
  return (
    <svg
      className="wordblue-hero__geometry"
      viewBox="0 0 1200 900"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <circle cx="620" cy="430" r="280" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="620" cy="430" r="210" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="620" cy="430" r="140" fill="none" stroke="currentColor" strokeWidth="1" />
      <path
        d="M 180 520 A 320 320 0 0 1 980 340"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M 260 620 A 380 380 0 0 1 1020 420"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <line x1="720" y1="120" x2="720" y2="760" stroke="currentColor" strokeWidth="1" />
      <line x1="860" y1="180" x2="860" y2="700" stroke="currentColor" strokeWidth="1" />
      <rect x="714" y="250" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="854" y="310" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function ColorDots() {
  return (
    <div className="wordblue-hero__dots" aria-hidden>
      <span className="wordblue-hero__dots-bar" />
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className="wordblue-hero__dot" />
      ))}
    </div>
  );
}

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
      <HeroGeometry />

      <div className="wordblue-hero__shell">
        <header className="wordblue-hero__topbar">
          <a
            href="#opening"
            className="wordblue-hero__brand font-body"
            onClick={(event) => {
              event.preventDefault();
              scroll?.scrollTo("opening");
            }}
          >
            <Image
              src="/collab/logo/wordblue-logo.png"
              alt="SynGlyph"
              width={300}
              height={80}
              className="wordblue-hero__logo"
              priority
            />
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
            <p className="wordblue-hero__ghost font-body" aria-hidden>
              BLUE
            </p>
            <h1 id={`${chapter.id}-title`} className="wordblue-hero__title m-0 font-body">
              <span className="wordblue-hero__title-line">WHEN WORDS</span>
              <span className="wordblue-hero__title-line">
                TURN <span className="wordblue-hero__title-accent">BLUE</span>
              </span>
            </h1>
          </div>

          <aside className="wordblue-hero__aside">
            <p className="wordblue-hero__sense-row m-0 font-body">
              SEE <span aria-hidden>|</span> HEAR <span aria-hidden>|</span> FEEL
            </p>
            <p className="wordblue-hero__tagline m-0 font-body">
              {chapter.subtitle}
            </p>
            <p className="wordblue-hero__archive m-0 font-body">
              On the page, nothing has changed. It is still made of the same strokes…
            </p>
          </aside>
        </div>

        <div className="wordblue-hero__center">
          <ColorDots />
          <p className="wordblue-hero__chip m-0 font-body">Language becomes colour</p>
        </div>

        <footer className="wordblue-hero__footer">
          <p className="wordblue-hero__origin m-0 font-body">Since the first blue word</p>
          <a
            href="#opening-prose"
            className="wordblue-hero__scroll m-0 font-body"
            onClick={(event) => {
              event.preventDefault();
              scroll?.scrollTo("opening-prose");
            }}
          >
            Scroll to listen
          </a>
        </footer>
      </div>
    </section>
  );
}
