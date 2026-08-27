/** True when a snap section is aligned to the viewport top (full-screen chapter). */
export function isSectionSnapAligned(section: Element | null): boolean {
  if (!(section instanceof HTMLElement)) return false;
  return Math.abs(section.getBoundingClientRect().top) < window.innerHeight * 0.15;
}
