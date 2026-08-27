"use client";

import { useMemo, useState } from "react";

import { resolveOpeningColorWord } from "@/content/openingColorWords";

import { ColorWord } from "./ColorWord";

type OpeningColorWordsProps = {
  words: string[];
};

function defaultSelectedWord(words: string[]): string {
  if (words.includes("blue")) return "blue";
  return words[0] ?? "";
}

export function OpeningColorWords({ words }: OpeningColorWordsProps) {
  const initial = useMemo(() => defaultSelectedWord(words), [words]);
  const [selected, setSelected] = useState(initial);

  const selectedData = resolveOpeningColorWord(selected);

  if (words.length === 0) return null;

  return (
    <div className="opening-color-words">
      <p className="opening-color-words__hint m-0 font-body text-xs">
        Interactive layer
      </p>
      <p className="opening-color-words__lead mt-2 font-body text-sm">
        Hover, focus, or click a word.
      </p>

      <div
        className="opening-color-words__cluster"
        role="group"
        aria-label="Interactive words"
      >
        {words.map((word) => {
          const data = resolveOpeningColorWord(word);
          return (
            <ColorWord
              key={word}
              text={word}
              auraColor={data.auraColor}
              active={selected === word}
              intensity={selected === word ? 1 : 0.72}
              onSelect={setSelected}
            />
          );
        })}
      </div>

      <div
        className="opening-color-words__panel"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="opening-color-words__meta m-0 font-body text-xs font-medium uppercase tracking-[0.18em]">
          Selected word
        </p>
        <p
          className="opening-color-words__word mt-4 font-display text-[clamp(1.75rem,5vw,2.5rem)] font-light leading-none"
          aria-hidden
        >
          {selectedData.text}
        </p>
        <span className="opening-color-words__pill mt-4 inline-block font-body text-xs">
          {selectedData.sensoryPath}
        </span>
        <p className="opening-color-words__description mt-5 font-body text-sm leading-relaxed">
          {selectedData.description}
        </p>
      </div>
    </div>
  );
}
