export function snapSections(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-snap-section]")];
}

export function pickDominantSnapSection(): HTMLElement | null {
  const vh = window.innerHeight;
  let best: HTMLElement | null = null;
  let bestScore = -1;

  for (const section of snapSections()) {
    const rect = section.getBoundingClientRect();
    const visible = Math.max(
      0,
      Math.min(rect.bottom, vh) - Math.max(rect.top, 0),
    );
    if (visible <= 0) continue;

    const isGallery = Boolean(section.querySelector("[data-scroll-gallery-track]"));
    const alignment = 1 - Math.min(1, Math.abs(rect.top) / vh);
    const score = visible + (isGallery ? 0 : alignment * vh * 0.55);

    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  return best;
}

/** Current chapter owns the wheel when it fills at least half the viewport. */
export function isSectionWheelActive(section: Element | null): boolean {
  if (!(section instanceof HTMLElement)) return false;
  const vh = window.innerHeight;
  const rect = section.getBoundingClientRect();
  const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  if (vh <= 0 || visible < vh * 0.5) return false;
  return pickDominantSnapSection() === section;
}

export function isSectionFullyAway(section: Element | null): boolean {
  if (!(section instanceof HTMLElement)) return true;
  const rect = section.getBoundingClientRect();
  const vh = window.innerHeight;
  return rect.bottom <= vh * 0.08 || rect.top >= vh * 0.92;
}

export function resolveSnapSection(node: Element | null): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  return node.closest<HTMLElement>("[data-snap-section]") ?? node;
}

export function adjacentSnapSection(
  section: HTMLElement,
  direction: 1 | -1,
): HTMLElement | null {
  const sections = snapSections();
  const index = sections.indexOf(section);
  if (index < 0) return null;
  return sections[index + direction] ?? null;
}
