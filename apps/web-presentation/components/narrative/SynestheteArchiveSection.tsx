"use client";

import type { Chapter } from "@/content/synesthesiaContent";
import { synestheteProfiles } from "@/content/synesthetes";

import { ArcArchiveFloor, type ArcArchiveItem } from "./ArcArchiveFloor";

type Props = {
  chapter: Chapter;
};

function formatType(type: string): string {
  return type
    .split(/\s*→\s*/)
    .map((part) => part.trim().toUpperCase())
    .join(" / ");
}

const synestheteItems: ArcArchiveItem[] = synestheteProfiles.map((profile) => ({
  id: profile.id,
  posterLabel: profile.name.toUpperCase(),
  floorTitle: profile.name.toUpperCase(),
  floorMeta: profile.work,
  floorTags: formatType(profile.type),
  description: profile.description,
  image: {
    src: profile.image.src,
    alt: profile.image.alt,
    fit:
      profile.id === "daniel-tammet" || profile.id === "sean-day"
        ? ("contain" as const)
        : ("cover" as const),
  },
}));

export function SynestheteArchiveSection({ chapter }: Props) {
  return (
    <ArcArchiveFloor
      sectionId={chapter.id}
      items={synestheteItems}
      sectionClassName="wordblue-archive wordblue-archive--synesthetes"
      ariaLabel={chapter.title}
      hint=""
    />
  );
}
