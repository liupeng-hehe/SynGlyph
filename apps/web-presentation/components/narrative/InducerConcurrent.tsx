"use client";

import { useMemo, useState, type CSSProperties } from "react";

import {
  defaultInducerId,
  inducerConcurrentExamples,
  type InducerConcurrentExample,
} from "@/content/inducerConcurrentExamples";

type InducerConcurrentProps = {
  defaultInducerId?: string;
};

function initialInducerId(requested?: string): string {
  if (
    requested &&
    inducerConcurrentExamples.some((example) => example.id === requested)
  ) {
    return requested;
  }
  return defaultInducerId;
}

export function InducerConcurrent({
  defaultInducerId: requestedDefaultId,
}: InducerConcurrentProps) {
  const [selectedId, setSelectedId] = useState(() =>
    initialInducerId(requestedDefaultId),
  );

  const selected = useMemo(
    () =>
      inducerConcurrentExamples.find((example) => example.id === selectedId) ??
      inducerConcurrentExamples[0],
    [selectedId],
  );

  if (!selected) return null;

  return (
    <div className="inducer-concurrent">
      <p className="inducer-concurrent__hint m-0 font-body text-xs">
        Interactive layer
      </p>
      <h3 className="inducer-concurrent__intro mt-2 font-display text-[clamp(1.15rem,2.5vw,1.35rem)] font-light text-[color:var(--text-display)]">
        Inducer → Concurrent
      </h3>
      <p className="inducer-concurrent__lead mt-2 font-body text-sm leading-relaxed">
        An inducer is the stimulus. A concurrent is the additional experience
        that may appear with it.
      </p>
      <p className="inducer-concurrent__lead mt-2 font-body text-sm">
        Select a stimulus to see possible accompanying experiences.
      </p>

      <div className="inducer-concurrent__grid">
        <div
          className="inducer-concurrent__inducers"
          role="group"
          aria-label="Inducer stimuli"
        >
          {inducerConcurrentExamples.map((example) => (
            <InducerButton
              key={example.id}
              example={example}
              selected={selectedId === example.id}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <InducerDetails example={selected} />
      </div>
    </div>
  );
}

type InducerButtonProps = {
  example: InducerConcurrentExample;
  selected: boolean;
  onSelect: (id: string) => void;
};

function InducerButton({ example, selected, onSelect }: InducerButtonProps) {
  return (
    <button
      type="button"
      className={`inducer-concurrent__button${selected ? " inducer-concurrent__button--selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(example.id)}
      onFocus={() => onSelect(example.id)}
    >
      <span className="inducer-concurrent__button-label">{example.inducerLabel}</span>
      <span className="inducer-concurrent__button-type">{example.inducerType}</span>
    </button>
  );
}

function InducerDetails({ example }: { example: InducerConcurrentExample }) {
  return (
    <div
      className="inducer-concurrent__details"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="m-0 font-body text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        Selected inducer
      </p>
      <h4 className="mt-3 font-display text-[clamp(1.35rem,3vw,1.75rem)] font-light text-[color:var(--text-display)]">
        {example.inducerLabel}
      </h4>
      <p className="mt-1 font-body text-sm text-[color:var(--text-body)]">
        {example.inducerType}
      </p>

      <div className="inducer-concurrent__examples mt-5">
        <p className="m-0 font-body text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          Example stimuli
        </p>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {example.stimulusExamples.map((stimulus) => (
            <li key={stimulus}>
              <span className="inducer-concurrent__example">{stimulus}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 font-body text-sm leading-relaxed text-[color:var(--text-body)]">
        {example.summary}
      </p>

      <div className="inducer-concurrent__connector" aria-hidden="true">
        <span className="inducer-concurrent__connector-label">Inducer</span>
        <span className="inducer-concurrent__connector-line" />
        <span className="inducer-concurrent__connector-label">Concurrent</span>
      </div>

      <ul className="inducer-concurrent__concurrent-list m-0 list-none p-0">
        {example.concurrents.map((concurrent) => (
          <li key={`${example.id}-${concurrent.label}`}>
            <article
              className="inducer-concurrent__concurrent-card"
              style={
                {
                  "--concurrent-aura": concurrent.auraColor,
                } as CSSProperties
              }
            >
              <span className="inducer-concurrent__aura" aria-hidden="true" />
              <div className="inducer-concurrent__concurrent-meta">
                <span className="inducer-concurrent__concurrent-label">
                  {concurrent.label}
                </span>
                <span className="inducer-concurrent__concurrent-domain">
                  {concurrent.sensoryDomain}
                </span>
              </div>
              <p className="inducer-concurrent__concurrent-description">
                {concurrent.description}
              </p>
            </article>
          </li>
        ))}
      </ul>

      {example.caution ? (
        <p className="inducer-concurrent__caution">{example.caution}</p>
      ) : null}
    </div>
  );
}
