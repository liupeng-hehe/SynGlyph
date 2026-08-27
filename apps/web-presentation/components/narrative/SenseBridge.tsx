"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

import { senseExamples } from "@/content/senseExamples";

/** Map a sense label to a theme-friendly accent color. */
function senseColor(label: string): string {
  const s = label.toLowerCase();
  if (s.includes("absence")) return "#9aa6c2";
  if (s.includes("pain")) return "#d97066";
  if (s.includes("touch")) return "#3fb0a3";
  if (s.includes("temperature")) return "#e0a85c";
  if (s.includes("taste")) return "#e98a86";
  if (s.includes("vision")) return "#4f86d6";
  if (s.includes("sound")) return "#8c7ad6";
  if (s.includes("language")) return "#cf86b0";
  return "#3a3f72";
}

/** Render the phrase with the borrowed (cross-sense) adjective tinted. */
function renderPhrase(phrase: string, accent: string) {
  const words = phrase.split(" ");
  if (words.length < 3) {
    return phrase;
  }
  const [article, adjective, ...rest] = words;
  return (
    <>
      {article}{" "}
      <span
        className="sense-bridge-card__accent"
        style={{ color: accent } as CSSProperties}
      >
        {adjective}
      </span>{" "}
      {rest.join(" ")}
    </>
  );
}

export function SenseBridge() {
  const [selected, setSelected] = useState(0);

  return (
    <div className="sense-bridge">
      <p className="sense-bridge__hint m-0 font-body text-xs">
        Interactive layer
      </p>
      <p className="sense-bridge__lead mt-2 font-body text-sm">
        Hover a card to trace how one sense describes another. Click to read
        the explanation.
      </p>

      <ul className="sense-bridge__list m-0 list-none p-0">
        {senseExamples.map((example, index) => {
          const isSelected = selected === index;
          const fromColor = senseColor(example.from);
          const toColor = senseColor(example.to);
          const cardStyle = {
            "--from": fromColor,
            "--to": toColor,
          } as CSSProperties;

          return (
            <li key={example.phrase}>
              <button
                type="button"
                style={cardStyle}
                className={`sense-bridge-card${isSelected ? " sense-bridge-card--selected" : ""}`}
                onClick={() => setSelected(index)}
                aria-expanded={isSelected}
                aria-label={`${example.phrase}. ${example.from} to ${example.to}.`}
              >
                <span className="sense-bridge-card__phrase font-display">
                  {renderPhrase(example.phrase, fromColor)}
                </span>

                <span className="sense-bridge-card__bridge">
                  <span className="sense-bridge-pill sense-bridge-pill--from">
                    {example.from}
                  </span>
                  <span className="sense-bridge-card__line" aria-hidden="true">
                    <span className="sense-bridge-card__line-fill" />
                  </span>
                  <span className="sense-bridge-pill sense-bridge-pill--to">
                    {example.to}
                  </span>
                </span>

                <span
                  className="sense-bridge-card__explanation font-body text-sm leading-relaxed"
                  role="region"
                  aria-label="Explanation"
                >
                  {example.explanation}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
