"use client";

import type { Chapter } from "@/content/synesthesiaContent";

import { EditorialWatercolorArt } from "./EditorialWatercolorArt";
import { SourcesDrawer } from "./SourcesDrawer";

type Props = {
  chapter: Chapter;
};

function splitTitle(title: string): { lead: string; emphasis: string | null } {
  const match = title.match(/^(When Words)\s+(.+)$/i);
  if (match) {
    return { lead: match[1], emphasis: match[2] };
  }
  return { lead: title, emphasis: null };
}

export function OpeningEditorialHero({ chapter }: Props) {
  const { lead, emphasis } = splitTitle(chapter.title);

  return (
    <section
      id={chapter.id}
      className="opening-editorial scroll-mt-[4.5rem]"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="opening-editorial__hero">
        <div className="opening-editorial__copy">
          <p className="opening-editorial__kicker m-0 font-body">
            {chapter.eyebrow}
          </p>

          <h1
            id={`${chapter.id}-title`}
            className="opening-editorial__title m-0 font-display"
          >
            {lead}
            {emphasis ? (
              <>
                <br />
                <em className="opening-editorial__title-em">{emphasis}</em>
              </>
            ) : null}
          </h1>

          {chapter.subtitle ? (
            <p className="opening-editorial__subtitle m-0 font-display">
              {chapter.subtitle}
            </p>
          ) : null}

          <div className="opening-editorial__body">
            {chapter.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="m-0 font-body">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="opening-editorial__sources">
            <SourcesDrawer sourceKeys={chapter.sourceKeys} variant="editorial" />
          </div>
        </div>

        <div className="opening-editorial__art-panel">
          <EditorialWatercolorArt />
        </div>
      </div>
    </section>
  );
}
