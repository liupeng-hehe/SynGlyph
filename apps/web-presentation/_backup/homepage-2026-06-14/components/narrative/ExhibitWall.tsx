"use client";

import Image from "next/image";
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  exhibitWallIntro,
  exhibits,
  type Exhibit,
} from "@/content/exhibits";

const COLUMN_SCROLL_PX = 400;
const TAP_MOVE_THRESHOLD_PX = 12;

export function ExhibitWall() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollTrack = useCallback((direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * COLUMN_SCROLL_PX,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="exhibit-wall">
      <header className="exhibit-wall__header">
        <p className="exhibit-wall__kicker">{exhibitWallIntro.kicker}</p>
        <h3 className="exhibit-wall__title">{exhibitWallIntro.title}</h3>
        <p className="exhibit-wall__lead">{exhibitWallIntro.lead}</p>
      </header>

      <div className="exhibit-wall__rail">
        <button
          type="button"
          className="exhibit-wall__nav exhibit-wall__nav--prev"
          aria-label="Scroll exhibition left"
          onClick={() => scrollTrack(-1)}
        >
          ←
        </button>

        <div className="exhibit-wall__fade exhibit-wall__fade--left" aria-hidden />

        <div
          ref={trackRef}
          className="exhibit-wall__track"
          role="region"
          aria-label="Exhibition artwork cards. Scroll horizontally."
        >
          {exhibits.map((exhibit, index) => (
            <ArtworkCard key={exhibit.id} exhibit={exhibit} index={index} />
          ))}
        </div>

        <div className="exhibit-wall__fade exhibit-wall__fade--right" aria-hidden />

        <button
          type="button"
          className="exhibit-wall__nav exhibit-wall__nav--next"
          aria-label="Scroll exhibition right"
          onClick={() => scrollTrack(1)}
        >
          →
        </button>
      </div>

      <p className="exhibit-wall__scroll-hint">{exhibitWallIntro.scrollHint}</p>
    </div>
  );
}

function ArtworkCard({
  exhibit,
  index,
}: {
  exhibit: Exhibit;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0, moved: false });

  const cardStyle = {
    "--exhibit-accent": exhibit.accentColor,
  } as CSSProperties;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const deltaX = Math.abs(event.clientX - pointerRef.current.x);
    const deltaY = Math.abs(event.clientY - pointerRef.current.y);
    if (deltaX > TAP_MOVE_THRESHOLD_PX || deltaY > TAP_MOVE_THRESHOLD_PX) {
      pointerRef.current.moved = true;
    }
  };

  const onCardClick = () => {
    if (pointerRef.current.moved) return;
    if (!window.matchMedia("(hover: none)").matches) return;
    setExpanded((value) => !value);
  };

  const closeOverlay = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    setExpanded(false);
  };

  return (
    <article
      className={`artwork-card${expanded ? " artwork-card--expanded" : ""}`}
      style={cardStyle}
      tabIndex={0}
      aria-expanded={expanded}
      aria-labelledby={`exhibit-${exhibit.id}-title`}
      aria-describedby={`exhibit-${exhibit.id}-caption`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={onCardClick}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          setExpanded(false);
        }
      }}
    >
      <div
        className={`artwork-card__image-wrap artwork-card__image-wrap--${exhibit.image.fit ?? "cover"}`}
      >
        <Image
          src={exhibit.image.src}
          alt={exhibit.image.alt}
          fill
          className="artwork-card__image"
          sizes="(max-width: 768px) 78vw, 380px"
          priority={index === 0}
          draggable={false}
        />

        <div className="artwork-card__detail-overlay">
          <button
            type="button"
            className="artwork-card__close"
            aria-label="Close curatorial note"
            onClick={closeOverlay}
          >
            ×
          </button>

          <div className="artwork-card__detail-scroll">
            <p className="artwork-card__detail-kicker">Curatorial Note</p>

            {exhibit.note.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="artwork-card__detail-copy">
                {paragraph}
              </p>
            ))}

            {exhibit.quote ? (
              <blockquote className="artwork-card__detail-quote">
                &ldquo;{exhibit.quote}&rdquo;
              </blockquote>
            ) : null}

            <p className="artwork-card__sense-path">{exhibit.path}</p>
          </div>
        </div>
      </div>

      <div className="artwork-card__label">
        <p className="artwork-card__artist">{exhibit.artist}</p>
        <h4 id={`exhibit-${exhibit.id}-title`} className="artwork-card__title">
          {exhibit.work}
        </h4>
        <p className="artwork-card__meta">
          {exhibit.year} · {exhibit.type}
        </p>
        <p id={`exhibit-${exhibit.id}-caption`} className="artwork-card__caption">
          {exhibit.caption}
        </p>
      </div>
    </article>
  );
}
