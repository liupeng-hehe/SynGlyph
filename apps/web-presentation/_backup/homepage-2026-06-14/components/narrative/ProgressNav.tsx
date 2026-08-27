"use client";

import { useEffect, useState } from "react";

export type ProgressNavItem = {
  id: string;
  eyebrow: string;
  navLabel: string;
};

type Props = {
  items: ProgressNavItem[];
};

const PRIMARY_COUNT = 3;

export function ProgressNav({ items }: Props) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

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
        rootMargin: "-10% 0px -55% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  const primary = items.slice(0, PRIMARY_COUNT);

  return (
    <nav
      className="editorial-chapter-nav sticky top-0 z-40"
      aria-label="Chapter navigation"
    >
      <div className="editorial-chapter-nav__inner">
        <a href="#opening" className="editorial-chapter-nav__logo" aria-label="Home">
          <span className="editorial-chapter-nav__logo-ring" aria-hidden="true" />
        </a>

        <ul className="editorial-chapter-nav__links m-0 list-none p-0">
          {primary.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="editorial-chapter-nav__link"
                aria-current={item.id === activeId ? "true" : undefined}
              >
                {item.eyebrow.toUpperCase()}
              </a>
            </li>
          ))}
          <li>
            <a href="#narrative-footer" className="editorial-chapter-nav__link">
              ABOUT
            </a>
          </li>
        </ul>

        <div className="editorial-chapter-nav__menu-wrap">
          <button
            type="button"
            className="editorial-chapter-nav__menu-btn"
            aria-expanded={menuOpen}
            aria-controls="editorial-chapter-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            MENU
          </button>
          {menuOpen ? (
            <div
              id="editorial-chapter-menu"
              className="editorial-chapter-nav__dropdown"
              role="menu"
            >
              <ul className="m-0 list-none p-0">
                {items.map((item) => (
                  <li key={item.id} role="none">
                    <a
                      href={`#${item.id}`}
                      role="menuitem"
                      className="editorial-chapter-nav__dropdown-link"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.eyebrow}
                    </a>
                  </li>
                ))}
                <li role="none">
                  <a
                    href="#narrative-footer"
                    role="menuitem"
                    className="editorial-chapter-nav__dropdown-link"
                    onClick={() => setMenuOpen(false)}
                  >
                    About
                  </a>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
