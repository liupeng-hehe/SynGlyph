"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { exhibits, type Exhibit } from "@/content/exhibits";

import { RippleImage } from "./RippleImage";
import { isSectionSnapAligned } from "./sectionScrollUtils";

function splitPath(path: string): string[] {
  return path.split(/\s*[↔→]\s*/).map((part) => part.trim());
}

function featuredTitleLines(exhibit: Exhibit): { lead: string; work: string } {
  const surname = exhibit.artist.split(" ").slice(-1)[0] ?? exhibit.artist;
  return {
    lead: `${surname} x`,
    work: exhibit.work,
  };
}

export function ExhibitWall() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = exhibits[activeIndex];

  const goTo = useCallback((index: number) => {
    setActiveIndex(Math.max(0, Math.min(exhibits.length - 1, index)));
  }, []);

  const step = useCallback(
    (delta: number) => {
      goTo(activeIndex + delta);
    },
    [activeIndex, goTo],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      const section = root.closest<HTMLElement>("[data-snap-section]");
      if (!isSectionSnapAligned(section)) return;

      const goingDown = event.deltaY > 0;
      const atEnd = activeIndex >= exhibits.length - 1;
      const atStart = activeIndex <= 0;

      if ((goingDown && !atEnd) || (!goingDown && !atStart)) {
        event.preventDefault();
        event.stopPropagation();
        if (lockRef.current) return;
        lockRef.current = true;
        step(goingDown ? 1 : -1);
        window.setTimeout(() => {
          lockRef.current = false;
        }, 420);
      }
    };

    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [activeIndex, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  if (!active) return null;

  const pathParts = splitPath(active.path);
  const title = featuredTitleLines(active);

  return (
    <div ref={rootRef} className="exhibit-feature">
      <div className="exhibit-feature__hero">
        <h3 className="exhibit-feature__title font-body" aria-live="polite">
          <span className="exhibit-feature__title-lead">{title.lead}</span>
          <span className="exhibit-feature__title-work">{title.work}</span>
        </h3>

        <div className="exhibit-feature__frame-wrap">
          <div className="exhibit-feature__frame">
            <RippleImage
              src={active.image.src}
              alt={active.image.alt}
              fit={active.image.fit ?? "cover"}
              className="exhibit-feature__image"
              priority={activeIndex === 0}
            />
          </div>

          <div className="exhibit-feature__frame-footer">
            <p className="exhibit-feature__counter m-0 font-body">
              {String(activeIndex + 1).padStart(2, "0")} /{" "}
              {String(exhibits.length).padStart(2, "0")}
            </p>
            <p className="exhibit-feature__credit m-0 font-body">{active.image.credit}</p>
          </div>
        </div>
      </div>

      <aside className="exhibit-feature__rail" aria-label="Exhibition details">
        <div className="exhibit-feature__rail-top">
          <div className="exhibit-feature__meta-panel">
            <p className="exhibit-feature__meta-kicker m-0 font-body">Crossed senses</p>
            <ul className="exhibit-feature__meta-list m-0 list-none p-0">
              {pathParts.map((part) => (
                <li key={part} className="exhibit-feature__meta-item font-body">
                  {part}
                </li>
              ))}
            </ul>
            <p className="exhibit-feature__meta-type m-0 font-body">
              {active.type} · {active.year}
            </p>
          </div>

          <div className="exhibit-feature__thumbs" role="tablist" aria-label="Exhibition works">
            {exhibits.map((exhibit, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={exhibit.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${exhibit.artist}, ${exhibit.work}`}
                  className={`exhibit-feature__thumb${isActive ? " exhibit-feature__thumb--active" : ""}`}
                  onClick={() => goTo(index)}
                >
                  <span
                    className="exhibit-feature__thumb-image"
                    style={{ backgroundImage: `url(${exhibit.image.src})` }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="exhibit-feature__notes">
          {active.note.map((paragraph) => (
            <p key={paragraph.slice(0, 48)} className="exhibit-feature__caption m-0 font-body">
              {paragraph}
            </p>
          ))}
        </div>
      </aside>
    </div>
  );
}
