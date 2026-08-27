import type { Chapter } from "@/content/synesthesiaContent";

import { InteractionRenderer } from "./InteractionRenderer";
import { OpeningEditorialHero } from "./OpeningEditorialHero";
import { SourcesDrawer } from "./SourcesDrawer";

type Props = {
  chapter: Chapter;
};

const WIDE_INTERACTIONS = new Set(["exhibitWall", "neuralDiagram"]);

export function ChapterShell({ chapter }: Props) {
  if (chapter.id === "opening") {
    return <OpeningEditorialHero chapter={chapter} />;
  }

  const wideInteraction = WIDE_INTERACTIONS.has(
    chapter.interaction?.type ?? "",
  );

  const textBlock = (
    <>
      <p className="narrative-eyebrow m-0 font-body">{chapter.eyebrow}</p>
      <h2
        id={`${chapter.id}-title`}
        className="narrative-title mt-4 font-display"
      >
        {chapter.title}
      </h2>
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
    <InteractionRenderer
      chapterId={chapter.id}
      interaction={chapter.interaction}
    />
  ) : null;

  return (
    <section
      id={chapter.id}
      className="narrative-chapter min-h-[calc(100dvh-5.75rem)] scroll-mt-[4.5rem] border-b border-[color:var(--border)] px-6 py-16 md:px-10 md:py-20"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="mx-auto max-w-6xl">
        {wideInteraction ? (
          <div className="space-y-10">
            <div className="max-w-3xl">{textBlock}</div>
            <div>{interactionBlock}</div>
            <SourcesDrawer sourceKeys={chapter.sourceKeys} />
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="min-w-0">
              {textBlock}
              <div className="mt-8">
                <SourcesDrawer sourceKeys={chapter.sourceKeys} />
              </div>
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              {interactionBlock}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
