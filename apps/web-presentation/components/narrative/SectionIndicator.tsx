"use client";

import { useEffect, useState } from "react";

import { useSmoothScroll } from "./SmoothScrollProvider";

export type SectionNavItem = {
  id: string;
  eyebrow: string;
  navLabel: string;
};

type Props = {
  items: SectionNavItem[];
};

export function SectionIndicator({ items }: Props) {
  const scroll = useSmoothScroll();
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const top = visible[0]?.target.id;
        if (top) setActiveId(top);
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  const lightNavIds = new Set([
    "synesthesia-sparks",
    "artworks-transition",
    "synesthetes",
  ]);
  const isLightNav = lightNavIds.has(activeId);

  if (activeId === "opening") return null;

  return (
    <aside className={`section-indicator${isLightNav ? " section-indicator--on-dark" : ""}`} aria-label="Section navigation">
      <ol className="section-indicator__list m-0 list-none p-0">
        {items.map((item, index) => {
          const num = String(index + 1).padStart(2, "0");
          const isActive = item.id === activeId;

          return (
            <li key={item.id} className="section-indicator__item">
              <button
                type="button"
                className={`section-indicator__btn${isActive ? " section-indicator__btn--active" : ""}`}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${num} ${item.navLabel}`}
                onClick={() => scroll?.scrollTo(item.id)}
              >
                <span className="section-indicator__num font-body">{num}</span>
                {isActive ? (
                  <span className="section-indicator__label font-body">
                    {item.navLabel}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
