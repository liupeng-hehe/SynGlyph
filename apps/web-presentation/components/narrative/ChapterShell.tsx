import type { Chapter } from "@/content/synesthesiaContent";

import { InteractionRenderer } from "./InteractionRenderer";
import { OpeningEditorialHero } from "./OpeningEditorialHero";
import { ViewReveal } from "./ViewReveal";
import { SourcesDrawer } from "./SourcesDrawer";

type Props = {
  chapter: Chapter;
  index: number;
};

const WIDE_INTERACTIONS = new Set<string>();

export function ChapterShell({ chapter, index }: Props) {
  if (chapter.id === "opening") {
    return <OpeningEditorialHero chapter={chapter} />;
  }

  const wideInteraction = WIDE_INTERACTIONS.has(
    chapter.interaction?.type ?? "",
  );
  const textOnly = !chapter.interaction;
  const textRevealClass =
    chapter.id === "personal-transition" ? "w-full" : "max-w-3xl";
  const sectionTone =
    index % 2 === 0 ? "narrative-chapter--mint" : "narrative-chapter--plain";
  const interactionShellClass = wideInteraction
    ? "narrative-chapter__interaction-shell narrative-chapter__interaction-shell--mint"
    : "narrative-chapter__interaction-shell";

  const textBlock = (
    <>
      <p className="narrative-eyebrow m-0 font-body">{chapter.eyebrow}</p>
      <h2
        id={`${chapter.id}-title`}
        className="narrative-title mt-4 font-display"
      >
        {chapter.title}
      </h2>
      <span className="narrative-chapter__title-rule" aria-hidden="true" />
      {chapter.subtitle ? (
        <p className="narrative-subtitle mt-4 font-body">{chapter.subtitle}</p>
      ) : null}
      <div className="mt-8 space-y-5">
        {chapter.body.map((paragraph) => (
          <p
            key={paragraph.slice(0, 48)}
            className="narrative-body m-0 font-body"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </>
  );

  const interactionBlock = chapter.interaction ? (
    <div className={interactionShellClass}>
      <InteractionRenderer
        chapterId={chapter.id}
        interaction={chapter.interaction}
      />
    </div>
  ) : null;

  return (
    <section
      id={chapter.id}
      data-snap-section
      className={`narrative-chapter ${sectionTone} min-h-[100svh] scroll-mt-0 px-6 py-16 md:px-10 md:py-20`}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="mx-auto max-w-6xl">
        {wideInteraction || textOnly ? (
          <div className="space-y-10">
            <ViewReveal className={textRevealClass}>{textBlock}</ViewReveal>
            {interactionBlock ? (
              <ViewReveal delay={140}>{interactionBlock}</ViewReveal>
            ) : null}
            <ViewReveal delay={220}>
              <SourcesDrawer sourceKeys={chapter.sourceKeys} />
            </ViewReveal>
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <ViewReveal className="min-w-0">
              {textBlock}
              <div className="mt-8">
                <SourcesDrawer sourceKeys={chapter.sourceKeys} />
              </div>
            </ViewReveal>
            <ViewReveal className="flex min-w-0 flex-col justify-center" delay={160}>
              {interactionBlock}
            </ViewReveal>
          </div>
        )}
      </div>
    </section>
  );
}
