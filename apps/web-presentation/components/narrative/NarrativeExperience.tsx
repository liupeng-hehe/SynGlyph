"use client";

import { chapters } from "@/content/synesthesiaContent";
import {
  synesthesiaSparksSlides,
} from "@/content/scrollGallerySlides";

import { ChapterShell } from "./ChapterShell";
import { ChapterTransitionSection } from "./ChapterTransitionSection";
import { ExhibitionChapter } from "./ExhibitionChapter";
import { InducerWheelSection } from "./InducerWheelSection";
import { OpeningEditorialHero } from "./OpeningEditorialHero";
import { OpeningProseSection } from "./OpeningProseSection";
import { PersonalTransitionSection } from "./PersonalTransitionSection";
import { ScrollGallerySection } from "./NeuroscienceScrollSection";
import { SectionIndicator } from "./SectionIndicator";
import { SmoothScrollProvider } from "./SmoothScrollProvider";
import { SynestheteArchiveSection } from "./SynestheteArchiveSection";

export function NarrativeExperience() {
  const navItems = chapters.map((chapter) => ({
    id: chapter.id,
    eyebrow: chapter.eyebrow,
    navLabel: chapter.navLabel,
  }));

  return (
    <SmoothScrollProvider>
      <main className="narrative-experience">
        <SectionIndicator items={navItems} />
        {chapters.map((chapter, index) => (
          <div key={chapter.id} className="narrative-chapter-group">
            {chapter.id === "opening" ? (
              <OpeningEditorialHero chapter={chapter} />
            ) : chapter.id === "opening-prose" ? (
              <OpeningProseSection chapter={chapter} />
            ) : chapter.id === "exhibition" ? (
              <ExhibitionChapter chapter={chapter} />
            ) : chapter.id === "artworks-transition" ? (
              <ChapterTransitionSection chapter={chapter} />
            ) : chapter.id === "what-is-synesthesia" ? (
              <InducerWheelSection chapter={chapter} />
            ) : chapter.id === "synesthesia-sparks" ? (
              <ScrollGallerySection
                chapter={chapter}
                slides={synesthesiaSparksSlides}
                themeClass="neuro-scroll-section neuro-scroll-section--sparks"
                showBody={false}
              />
            ) : chapter.id === "personal-transition" ? (
              <PersonalTransitionSection chapter={chapter} />
            ) : chapter.id === "synesthetes" ? (
              <SynestheteArchiveSection chapter={chapter} />
            ) : (
              <ChapterShell chapter={chapter} index={index} />
            )}
          </div>
        ))}
      </main>
    </SmoothScrollProvider>
  );
}
