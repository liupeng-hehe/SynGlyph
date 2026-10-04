"use client";

import { useMemo, useState } from "react";

import {
  consistencyDemoColors,
  defaultNeuralPathModelId,
  neuralPathModels,
  type NeuralPathModel,
} from "@/content/neuralPathModels";
import { neuroscienceCards } from "@/content/neuroscienceCards";

type ProjectorMode = "external" | "internal";

export function NeuralPathDiagram() {
  const [pathId, setPathId] = useState(defaultNeuralPathModelId);

  const activeModel = useMemo(
    () =>
      neuralPathModels.find((model) => model.id === pathId) ??
      neuralPathModels[0],
    [pathId],
  );

  if (!activeModel) return null;

  return (
    <div className="neural-path-diagram">
      <p className="neural-path-diagram__hint m-0 font-body text-xs">
        Interactive layer
      </p>
      <h3 className="neural-path-diagram__intro mt-2 font-display text-[clamp(1.1rem,2.4vw,1.3rem)] font-light text-[color:var(--text-display)]">
        Possible neural pathways
      </h3>
      <p className="neural-path-diagram__lead mt-2 font-body text-sm leading-relaxed">
        Researchers propose several explanations. These diagrams show one
        possible path, not a single proven mechanism.
      </p>

      <div
        className="neural-path-diagram__toggles"
        role="tablist"
        aria-label="Pathway models"
      >
        {neuralPathModels.map((model) => (
          <button
            key={model.id}
            type="button"
            role="tab"
            aria-selected={pathId === model.id}
            className={`neural-path-diagram__toggle${pathId === model.id ? " neural-path-diagram__toggle--active" : ""}`}
            onClick={() => setPathId(model.id)}
          >
            {model.toggleLabel}
          </button>
        ))}
      </div>

      <div className="neural-path-diagram__diagram-panel">
        <PathDiagramSvg model={activeModel} />
        <p className="neural-path-diagram__branch-caption">
          {activeModel.branchCaption}
        </p>
      </div>

      <ul className="neural-path-diagram__cards m-0 list-none p-0">
        {neuroscienceCards.map((card, index) => (
          <li key={card.title}>
            <NeuroscienceCardPanel cardIndex={index} card={card} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PathDiagramSvg({ model }: { model: NeuralPathModel }) {
  return (
    <svg
      className="neural-path-diagram__svg"
      viewBox="0 0 420 200"
      role="img"
      aria-label={`Possible pathway: ${model.stimulusLabel} to ${model.meaningLabel}, with an additional path to ${model.concurrentLabel}`}
    >
      <defs>
        <marker
          id="neural-arrow-ink"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ink)" />
        </marker>
        <marker
          id="neural-arrow-accent"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
        </marker>
      </defs>

      <DiagramNode x={12} y={72} width={96} height={44} label={model.stimulusLabel} />
      <DiagramNode
        x={148}
        y={72}
        width={108}
        height={44}
        label={model.recognitionLabel}
      />
      <DiagramNode x={296} y={72} width={96} height={44} label={model.meaningLabel} />

      <DiagramNode
        x={148}
        y={142}
        width={120}
        height={44}
        label={model.concurrentLabel}
        aura={model.concurrentAura}
        variant="concurrent"
      />

      <line
        x1={108}
        y1={94}
        x2={148}
        y2={94}
        className="neural-path-diagram__line neural-path-diagram__line--main"
        markerEnd="url(#neural-arrow-ink)"
      />
      <line
        x1={256}
        y1={94}
        x2={296}
        y2={94}
        className="neural-path-diagram__line neural-path-diagram__line--main"
        markerEnd="url(#neural-arrow-ink)"
      />
      <path
        d="M 202 116 C 202 128, 208 132, 208 142"
        className="neural-path-diagram__line neural-path-diagram__line--synesthetic"
        markerEnd="url(#neural-arrow-accent)"
        fill="none"
      />

      <text x={168} y={132} className="neural-path-diagram__line-label">
        possible path
      </text>
      <text x={12} y={24} className="neural-path-diagram__path-label">
        Ordinary pathway
      </text>
      <text x={12} y={44} className="neural-path-diagram__path-label neural-path-diagram__path-label--synesthetic">
        Additional experience
      </text>
    </svg>
  );
}

function DiagramNode({
  x,
  y,
  width,
  height,
  label,
  aura,
  variant = "main",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  aura?: string;
  variant?: "main" | "concurrent";
}) {
  const lines = wrapLabel(label, variant === "concurrent" ? 14 : 16);
  const lineHeight = 14;
  const textY =
    y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + 4;

  return (
    <g>
      {variant === "concurrent" && aura ? (
        <rect
          x={x - 4}
          y={y - 4}
          width={width + 8}
          height={height + 8}
          rx={10}
          fill={aura}
          opacity={0.18}
        />
      ) : null}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        className={`neural-path-diagram__node${variant === "concurrent" ? " neural-path-diagram__node--concurrent" : ""}`}
      />
      {lines.map((line, index) => (
        <text
          key={`${label}-${index}`}
          x={x + width / 2}
          y={textY + index * lineHeight}
          className="neural-path-diagram__node-label"
          textAnchor="middle"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type CardProps = {
  cardIndex: number;
  card: (typeof neuroscienceCards)[number];
};

function NeuroscienceCardPanel({ cardIndex, card }: CardProps) {
  return (
    <article className="neural-path-diagram__card">
      <h4 className="neural-path-diagram__card-title">{card.title}</h4>
      <div className="neural-path-diagram__card-body">
        {card.body.map((paragraph) => (
          <p key={paragraph.slice(0, 40)} className="neural-path-diagram__card-copy">
            {paragraph}
          </p>
        ))}
      </div>

      {cardIndex === 2 ? <ProjectorToggle /> : null}
      {cardIndex === 3 ? <ConsistencyDemo /> : null}

      <p className="neural-path-diagram__card-caution">{card.caution}</p>
    </article>
  );
}

function ProjectorToggle() {
  const [mode, setMode] = useState<ProjectorMode>("external");

  return (
    <div className="neural-path-diagram__mini-interaction">
      <div className="neural-path-diagram__mini-toggles" role="group" aria-label="Experience location">
        <button
          type="button"
          className={`neural-path-diagram__mini-toggle${mode === "external" ? " neural-path-diagram__mini-toggle--active" : ""}`}
          aria-pressed={mode === "external"}
          onClick={() => setMode("external")}
        >
          External space
        </button>
        <button
          type="button"
          className={`neural-path-diagram__mini-toggle${mode === "internal" ? " neural-path-diagram__mini-toggle--active" : ""}`}
          aria-pressed={mode === "internal"}
          onClick={() => setMode("internal")}
        >
          Mind&apos;s eye
        </button>
      </div>
      <p className="neural-path-diagram__mini-copy">
        {mode === "external"
          ? "Projector-like experience: the concurrent may feel as if it appears in external space."
          : "Associator-like experience: the concurrent may feel internal, in the mind's eye."}
      </p>
    </div>
  );
}

function ConsistencyDemo() {
  const [round, setRound] = useState<1 | 2>(1);
  const [round1Choice, setRound1Choice] = useState<string | null>(null);
  const [round2Choice, setRound2Choice] = useState<string | null>(null);

  const activeChoice = round === 1 ? round1Choice : round2Choice;
  const bothChosen = round1Choice !== null && round2Choice !== null;
  const stable = bothChosen && round1Choice === round2Choice;

  function handlePick(colorId: string) {
    if (round === 1) {
      setRound1Choice(colorId);
      setRound(2);
      return;
    }
    setRound2Choice(colorId);
  }

  function reset() {
    setRound(1);
    setRound1Choice(null);
    setRound2Choice(null);
  }

  return (
    <div className="neural-path-diagram__mini-interaction">
      <p className="neural-path-diagram__mini-heading">
        Round {round}: What color is A?
      </p>
      <div className="neural-path-diagram__swatches" role="group" aria-label="Choose a red shade">
        {consistencyDemoColors.map((color) => (
          <button
            key={`${round}-${color.id}`}
            type="button"
            className={`neural-path-diagram__swatch${activeChoice === color.id ? " neural-path-diagram__swatch--active" : ""}`}
            style={{ backgroundColor: color.hex }}
            aria-label={color.label}
            aria-pressed={activeChoice === color.id}
            onClick={() => handlePick(color.id)}
          />
        ))}
      </div>

      {bothChosen ? (
        <p className="neural-path-diagram__mini-copy">
          {stable
            ? "Stable associations may suggest a synesthetic pattern."
            : "Different choices do not necessarily mean the experience is not synesthetic, this demo is educational only."}
        </p>
      ) : (
        <p className="neural-path-diagram__mini-copy">
          Pick a red for A. A second round will ask the same question again.
        </p>
      )}

      {bothChosen ? (
        <button
          type="button"
          className="neural-path-diagram__reset"
          onClick={reset}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
