"use client";

import { useState } from "react";

import { senseExamples } from "@/content/senseExamples";

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
          return (
            <li key={example.phrase}>
              <button
                type="button"
                className={`sense-bridge-card${isSelected ? " sense-bridge-card--selected" : ""}`}
                onClick={() => setSelected(index)}
                aria-expanded={isSelected}
                aria-label={`${example.phrase}. ${example.from} to ${example.to}.`}
              >
                <span className="sense-bridge-card__phrase font-display text-[color:var(--text-display)]">
                  {example.phrase}
                </span>

                <span className="sense-bridge-card__bridge">
                  <span className="sense-bridge-pill">{example.from}</span>
                  <span className="sense-bridge-card__line" aria-hidden="true">
                    <span className="sense-bridge-card__line-fill" />
                  </span>
                  <span className="sense-bridge-pill">{example.to}</span>
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
