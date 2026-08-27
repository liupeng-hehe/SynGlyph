import type { Chapter } from "@/content/synesthesiaContent";

type Props = {
  chapter: Chapter;
  variant?: "artworks-sparks";
};

export function ChapterTransitionSection({
  chapter,
  variant = "artworks-sparks",
}: Props) {
  return (
    <section
      id={chapter.id}
      data-snap-section
      data-nav-theme="dark"
      className={`chapter-transition chapter-transition--${variant} narrative-chapter scroll-mt-0`}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="chapter-transition__inner">
        <p className="chapter-transition__eyebrow m-0 font-body">{chapter.eyebrow}</p>
        <h2 id={`${chapter.id}-title`} className="chapter-transition__title m-0 font-body">
          {chapter.title}
        </h2>
        {chapter.subtitle ? (
          <p className="chapter-transition__subtitle m-0 font-body">{chapter.subtitle}</p>
        ) : null}
        <div className="chapter-transition__body">
          {chapter.body.map((paragraph) => (
            <p key={paragraph.slice(0, 48)} className="chapter-transition__paragraph m-0 font-body">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
