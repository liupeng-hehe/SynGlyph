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
  const [navMode, setNavMode] = useState<"on-dark" | "on-light" | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const syncActiveSection = () => {
      const focusY = window.innerHeight * 0.5;
      const active = sections.find((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= focusY && rect.bottom > focusY;
      });

      if (active) setActiveId(active.id);
    };

    syncActiveSection();
    const unsubscribe = scroll?.subscribeScroll(syncActiveSection);
    window.addEventListener("scroll", syncActiveSection, { passive: true });
    window.addEventListener("resize", syncActiveSection);

    return () => {
      unsubscribe?.();
      window.removeEventListener("scroll", syncActiveSection);
      window.removeEventListener("resize", syncActiveSection);
    };
  }, [items, scroll]);

  useEffect(() => {
    const section = document.getElementById(activeId);
    if (!section) {
      setNavMode(null);
      return;
    }

    const read = () => {
      const value = section.getAttribute("data-nav");
      setNavMode(value === "on-dark" || value === "on-light" ? value : null);
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(section, { attributes: true, attributeFilter: ["data-nav"] });
    return () => observer.disconnect();
  }, [activeId]);

  const lightNavIds = new Set([
    "what-is-synesthesia",
    "synesthesia-sparks",
    "synesthetes",
  ]);
  const isLightNav =
    navMode === "on-dark" ? true : navMode === "on-light" ? false : lightNavIds.has(activeId);

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
