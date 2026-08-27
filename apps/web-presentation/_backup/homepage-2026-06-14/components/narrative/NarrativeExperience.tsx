import { chapters } from "@/content/synesthesiaContent";

import { ChapterShell } from "./ChapterShell";
import { NarrativeFooter } from "./NarrativeFooter";
import { ProgressNav } from "./ProgressNav";

export function NarrativeExperience() {
  const navItems = chapters.map((chapter) => ({
    id: chapter.id,
    eyebrow: chapter.eyebrow,
    navLabel: chapter.navLabel,
  }));

  return (
    <main className="narrative-experience">
      <ProgressNav items={navItems} />
      {chapters.map((chapter) => (
        <ChapterShell key={chapter.id} chapter={chapter} />
      ))}
      <NarrativeFooter />
    </main>
  );
}
