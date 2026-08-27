"use client";

import Image from "next/image";

import type { Chapter } from "@/content/synesthesiaContent";
import { synestheteProfiles } from "@/content/synesthetes";

import { SourcesDrawer } from "./SourcesDrawer";
import { ViewReveal } from "./ViewReveal";

type Props = {
  chapter: Chapter;
};

export function SynestheteGridSection({ chapter }: Props) {
  return (
    <section
      id={chapter.id}
      data-snap-section
      className="synesthete-grid-section narrative-chapter narrative-chapter--plain min-h-[100svh] scroll-mt-0 px-6 py-16 md:px-10 md:py-20"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="mx-auto max-w-6xl">
        <ViewReveal className="max-w-3xl">
          <p className="narrative-eyebrow m-0 font-body">{chapter.eyebrow}</p>
          <h2 id={`${chapter.id}-title`} className="narrative-title mt-4 font-display">
            {chapter.title}
          </h2>
          <span className="narrative-chapter__title-rule" aria-hidden="true" />
          {chapter.subtitle ? (
            <p className="narrative-subtitle mt-4 font-body">{chapter.subtitle}</p>
          ) : null}
        </ViewReveal>

        <div className="synesthete-grid-section__grid mt-12">
          {synestheteProfiles.map((profile, index) => (
            <ViewReveal key={profile.id} delay={80 + index * 40}>
              <article className="synesthete-grid-section__card">
                <div className="synesthete-grid-section__media">
                  <Image
                    src={profile.image.src}
                    alt={profile.image.alt}
                    fill
                    sizes="(max-width: 960px) 100vw, 33vw"
                    className="synesthete-grid-section__image"
                  />
                </div>
                <div className="synesthete-grid-section__copy">
                  <h3 className="synesthete-grid-section__name m-0 font-body">
                    {profile.name}
                  </h3>
                  <p className="synesthete-grid-section__type m-0 font-body">
                    {profile.type}
                  </p>
                  <p className="synesthete-grid-section__work m-0 font-body">
                    {profile.work}
                  </p>
                  <p className="synesthete-grid-section__description m-0 font-body">
                    {profile.description}
                  </p>
                </div>
              </article>
            </ViewReveal>
          ))}
        </div>

        <ViewReveal delay={220}>
          <div className="mt-10 space-y-5">
            {chapter.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="narrative-body m-0 font-body">
                {paragraph}
              </p>
            ))}
          </div>
          <SourcesDrawer sourceKeys={chapter.sourceKeys} />
        </ViewReveal>
      </div>
    </section>
  );
}
