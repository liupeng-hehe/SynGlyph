"use client";

import { chapters } from "@/content/synesthesiaContent";
import {
  synesthesiaSparksSlides,
} from "@/content/scrollGallerySlides";

import { ChapterShell } from "./ChapterShell";
import { ClosingCodaSection } from "./ClosingCodaSection";
import { ExhibitionChapter } from "./ExhibitionChapter";
import { InducerWheelSection } from "./InducerWheelSection";
import { OpeningEditorialHero } from "./OpeningEditorialHero";
import { OpeningProseSection } from "./OpeningProseSection";
import {
  NarrativeBridgeTransition,
  PersonalArchiveTransition,
} from "./PersonalArchiveTransition";
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
            ) : chapter.id === "what-is-synesthesia" ? (
              <InducerWheelSection chapter={chapter} />
            ) : chapter.id === "synesthesia-sparks" ? (
              <>
                <ScrollGallerySection
                  chapter={chapter}
                  slides={synesthesiaSparksSlides}
                  themeClass="neuro-scroll-section neuro-scroll-section--sparks"
                  showBody={false}
                />
                <NarrativeBridgeTransition
                  id="synesthesia-sparks-bridge"
                  variant="dark-to-light"
                  ariaLabel="From synesthesia facts to a personal story"
                >
                  It is difficult to understand a perspective you have never
                  experienced. So I want to share my story, and I invite you to
                  see through my eyes.
                </NarrativeBridgeTransition>
              </>
            ) : chapter.id === "personal-transition" ? (
              <>
                <PersonalTransitionSection chapter={chapter} />
                <PersonalArchiveTransition />
              </>
            ) : chapter.id === "synesthetes" ? (
              <>
                <SynestheteArchiveSection chapter={chapter} />
                <ClosingCodaSection />
              </>
            ) : (
              <ChapterShell chapter={chapter} index={index} />
            )}
          </div>
        ))}
      </main>
    </SmoothScrollProvider>
  );
}
