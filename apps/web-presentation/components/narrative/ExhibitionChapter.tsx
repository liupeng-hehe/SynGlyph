import type { Chapter } from "@/content/synesthesiaContent";

import { ExhibitWall } from "./ExhibitWall";

type Props = {
  chapter: Chapter;
};

export function ExhibitionChapter({ chapter }: Props) {
  return (
    <section
      id={chapter.id}
      data-snap-section
      className="narrative-chapter narrative-chapter--exhibit min-h-[100svh] scroll-mt-0"
      aria-labelledby={`${chapter.id}-title`}
    >
      <h2 id={`${chapter.id}-title`} className="sr-only">
        {chapter.title}
      </h2>

      <ExhibitWall />
    </section>
  );
}
