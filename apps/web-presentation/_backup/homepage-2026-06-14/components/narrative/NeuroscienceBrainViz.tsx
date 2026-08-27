"use client";

import { useMemo, useState, type CSSProperties } from "react";

import {
  brainModes,
  brainRegions,
  defaultBrainModeId,
  defaultMechanismId,
  neuroscienceBrainNote,
  neuroscienceMechanisms,
  type BrainMode,
  type BrainPathSegment,
  type BrainRegion,
  type BrainRegionId,
  type NeuroscienceMechanism,
} from "@/content/neuroscienceBrainModes";

export type NeuroscienceBrainVizProps = {
  defaultModeId?: string;
  defaultMechanismId?: string;
};

type Point = { x: number; y: number };

const STIMULUS_POINT: Point = { x: 42, y: 230 };
const CONCURRENT_POINT: Point = { x: 664, y: 220 };

const BRAIN_OUTLINE =
  "M90 248 C74 178 106 104 184 72 C244 44 310 48 356 64 C414 36 516 60 586 122 C662 190 656 286 594 350 C532 414 430 416 356 386 C300 412 206 392 154 344 C110 322 96 288 90 248 Z";

const BRAIN_SULCI = [
  "M172 142 C230 112 314 118 370 154",
  "M204 220 C278 192 382 202 464 248",
  "M236 318 C312 292 410 300 506 334",
  "M420 104 C452 148 454 196 428 232",
  "M548 166 C514 206 512 248 544 284",
];

const LABEL_OFFSETS: Partial<Record<BrainRegionId, Point>> = {
  visualInput: { x: -8, y: 52 },
  graphemeRecognition: { x: -12, y: 48 },
  colorExperience: { x: -72, y: -44 },
  auditoryProcessing: { x: 8, y: 50 },
  parietalBinding: { x: -4, y: -54 },
  spatialMapping: { x: 10, y: -48 },
  languageSemantic: { x: 12, y: 46 },
  conceptualAssociation: { x: -78, y: -8 },
};

export function NeuroscienceBrainViz({
  defaultModeId = defaultBrainModeId,
  defaultMechanismId: initialMechanismId = defaultMechanismId,
}: NeuroscienceBrainVizProps) {
  const [modeId, setModeId] = useState(defaultModeId);
  const [mechanismId, setMechanismId] = useState(initialMechanismId);

  const regionMap = useMemo(
    () => Object.fromEntries(brainRegions.map((r) => [r.id, r])) as Record<
      BrainRegionId,
      BrainRegion
    >,
    [],
  );

  const activeMode = useMemo(
    () => brainModes.find((m) => m.id === modeId) ?? brainModes[0],
    [modeId],
  );

  const activeMechanism = useMemo(
    () =>
      neuroscienceMechanisms.find((m) => m.id === mechanismId) ??
      neuroscienceMechanisms[0],
    [mechanismId],
  );

  const getPoint = (id: BrainRegionId | "stimulus" | "concurrent"): Point => {
    if (id === "stimulus") return STIMULUS_POINT;
    if (id === "concurrent") return CONCURRENT_POINT;
    const region = regionMap[id];
    return { x: region.x, y: region.y };
  };

  if (!activeMode || !activeMechanism) return null;

  const activeRegionSet = new Set(activeMode.activeRegions);

  return (
    <div className="neuroscience-brain-viz">
      <header className="neuroscience-brain-viz__header">
        <p className="neuroscience-brain-viz__hint">Interactive layer</p>
        <h3 className="neuroscience-brain-viz__title">
          Proposed neural pathways
        </h3>
      </header>

      <div
        className="neuroscience-brain-viz__mode-tabs"
        role="tablist"
        aria-label="Synesthetic modes"
      >
        {brainModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={modeId === mode.id}
            className={`neuroscience-brain-viz__mode-button${modeId === mode.id ? " is-active" : ""}`}
            onClick={() => setModeId(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="neuroscience-brain-viz__plate">
        <div className="neuroscience-brain-viz__svg-wrap">
          <BrainSketchSvg
            mode={activeMode}
            mechanism={activeMechanism}
            regionMap={regionMap}
            activeRegionSet={activeRegionSet}
            getPoint={getPoint}
          />
        </div>

        <ul
          className="neuroscience-brain-viz__mobile-legend m-0 list-none p-0"
          aria-label="Active proposed regions"
        >
          {activeMode.activeRegions.map((id) => {
            const region = regionMap[id];
            return (
              <li key={id}>
                <span
                  className="neuroscience-brain-viz__legend-dot"
                  style={{ "--region-color": region.color } as CSSProperties}
                  aria-hidden
                />
                {region.label}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="neuroscience-brain-viz__caption" aria-live="polite">
        <p className="neuroscience-brain-viz__caption-summary">
          {activeMode.summary}
        </p>
        <p className="neuroscience-brain-viz__caption-detail">
          {activeMode.caption}
        </p>
        <p className="neuroscience-brain-viz__caption-caution">
          {activeMode.caution}
        </p>
      </div>

      <div
        className="neuroscience-brain-viz__mechanisms"
        role="tablist"
        aria-label="Research mechanisms"
      >
        {neuroscienceMechanisms.map((mechanism) => (
          <button
            key={mechanism.id}
            type="button"
            role="tab"
            aria-selected={mechanismId === mechanism.id}
            className={`neuroscience-brain-viz__mechanism-button${mechanismId === mechanism.id ? " is-active" : ""}`}
            onClick={() => setMechanismId(mechanism.id)}
          >
            {mechanism.shortTitle}
          </button>
        ))}
      </div>

      <div className="neuroscience-brain-viz__mechanism-panel" aria-live="polite">
        <h4 className="neuroscience-brain-viz__mechanism-title">
          {activeMechanism.title}
        </h4>
        <p className="neuroscience-brain-viz__mechanism-copy">
          {activeMechanism.description}
        </p>
        <p className="neuroscience-brain-viz__mechanism-caution">
          {activeMechanism.caution}
        </p>
      </div>

      <p className="neuroscience-brain-viz__note">{neuroscienceBrainNote}</p>
    </div>
  );
}

function BrainSketchSvg({
  mode,
  mechanism,
  regionMap,
  activeRegionSet,
  getPoint,
}: {
  mode: BrainMode;
  mechanism: NeuroscienceMechanism;
  regionMap: Record<BrainRegionId, BrainRegion>;
  activeRegionSet: Set<BrainRegionId>;
  getPoint: (id: BrainRegionId | "stimulus" | "concurrent") => Point;
}) {
  const emphasizePath =
    mechanism.visualHint === "pathway" || mechanism.visualHint === "connectivity";

  const sketchLabel = `Hand-drawn lateral brain sketch: ${mode.label}. ${mode.caption}`;

  return (
    <svg
      className="brain-sketch"
      viewBox="0 0 720 460"
      role="img"
      aria-label={sketchLabel}
    >
      <defs>
        <marker
          id="brain-feedback-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M0,0 L8,4 L0,8 Z"
            className="brain-sketch__arrowhead"
          />
        </marker>
        <filter id="brain-region-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Paper field */}
      <rect
        x="8"
        y="8"
        width="704"
        height="444"
        rx="12"
        className="brain-sketch__paper"
        aria-hidden
      />

      {/* Mechanism: projector overlay */}
      {mechanism.visualHint === "projector" ? (
        <g className="brain-sketch__projector-layer" aria-hidden>
          <ellipse
            cx="600"
            cy="218"
            rx="88"
            ry="72"
            className="brain-sketch__external-aura"
          />
          <text x="600" y="214" className="brain-sketch__projector-label">
            external space
          </text>
          <ellipse
            cx="380"
            cy="210"
            rx="36"
            ry="28"
            className="brain-sketch__minds-eye"
          />
          <text x="380" y="214" className="brain-sketch__projector-label brain-sketch__projector-label--inner">
            mind&apos;s eye
          </text>
        </g>
      ) : null}

      {/* Brain outline — hand-drawn double stroke */}
      <path
        d={BRAIN_OUTLINE}
        className="brain-sketch__outline-secondary"
        aria-hidden
      />
      <path d={BRAIN_OUTLINE} className="brain-sketch__outline" />

      {BRAIN_SULCI.map((d) => (
        <path key={d} d={d} className="brain-sketch__sulcus" aria-hidden />
      ))}

      {/* Mechanism: connectivity — faint links between active regions */}
      {mechanism.visualHint === "connectivity"
        ? renderConnectivityLinks(mode.activeRegions, getPoint)
        : null}

      {/* Path segments */}
      {mode.path.map((segment, index) => (
        <PathSegment
          key={`${segment.from}-${segment.to}-${index}`}
          segment={segment}
          getPoint={getPoint}
          emphasize={emphasizePath}
        />
      ))}

      {/* Bridge to concurrent label */}
      <path
        d={curvedPath(
          getPoint(mode.path[mode.path.length - 1]?.to as BrainRegionId),
          CONCURRENT_POINT,
          0.35,
        )}
        className="brain-sketch__path brain-sketch__path--feedback brain-sketch__path--to-concurrent"
        markerEnd="url(#brain-feedback-arrow)"
        aria-hidden
      />

      {/* Regions */}
      {brainRegions.map((region) => {
        const isActive = activeRegionSet.has(region.id);
        return (
          <g key={region.id}>
            {isActive ? (
              <ellipse
                cx={region.x}
                cy={region.y}
                rx={region.rx + 10}
                ry={region.ry + 8}
                className="brain-sketch__region-aura"
                style={
                  { "--region-color": region.color } as CSSProperties
                }
                aria-hidden
              />
            ) : null}
            <ellipse
              cx={region.x}
              cy={region.y}
              rx={region.rx}
              ry={region.ry}
              className={`brain-sketch__region${isActive ? " is-active" : ""}`}
              style={{ "--region-color": region.color } as CSSProperties}
            />
            {isActive ? (
              <circle
                cx={region.x}
                cy={region.y}
                r={4}
                className="brain-sketch__region-dot"
                aria-hidden
              />
            ) : null}
          </g>
        );
      })}

      {/* Desktop region labels */}
      {mode.activeRegions.map((id) => (
        <RegionLabel key={id} region={regionMap[id]} />
      ))}

      {/* Stimulus / concurrent pins */}
      <g className="brain-sketch__stimulus" aria-hidden>
        <circle cx={STIMULUS_POINT.x} cy={STIMULUS_POINT.y} r={5} />
        <text x={STIMULUS_POINT.x} y={STIMULUS_POINT.y + 22}>
          {mode.stimulus}
        </text>
      </g>
      <g className="brain-sketch__concurrent" aria-hidden>
        <circle cx={CONCURRENT_POINT.x} cy={CONCURRENT_POINT.y} r={5} />
        <text x={CONCURRENT_POINT.x} y={CONCURRENT_POINT.y + 22}>
          {mode.concurrent}
        </text>
      </g>

      {/* Mechanism: consistency inset */}
      {mechanism.visualHint === "consistency" ? (
        <g className="brain-sketch__inset" aria-hidden>
          <rect x="24" y="24" width="148" height="72" rx="6" />
          <text x="36" y="46">
            Round 1: A → blue
          </text>
          <text x="36" y="66">
            Later: A → blue
          </text>
          <text x="36" y="86" className="brain-sketch__inset-note">
            educational only
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function PathSegment({
  segment,
  getPoint,
  emphasize,
}: {
  segment: BrainPathSegment;
  getPoint: (id: BrainRegionId | "stimulus" | "concurrent") => Point;
  emphasize: boolean;
}) {
  const from = getPoint(segment.from);
  const to = getPoint(segment.to);
  const d = curvedPath(from, to);

  const className = [
    "brain-sketch__path",
    `brain-sketch__path--${segment.kind}`,
    emphasize && segment.kind !== "ordinary" ? " is-emphasized" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <path
      d={d}
      className={className}
      markerEnd={
        segment.kind === "feedback" ? "url(#brain-feedback-arrow)" : undefined
      }
      aria-hidden
    />
  );
}

function renderConnectivityLinks(
  activeRegions: BrainRegionId[],
  getPoint: (id: BrainRegionId | "stimulus" | "concurrent") => Point,
) {
  const links: { from: BrainRegionId; to: BrainRegionId }[] = [];
  for (let i = 0; i < activeRegions.length; i++) {
    for (let j = i + 1; j < activeRegions.length; j++) {
      links.push({ from: activeRegions[i], to: activeRegions[j] });
    }
  }

  return links.map(({ from, to }) => (
    <path
      key={`${from}-${to}`}
      d={curvedPath(getPoint(from), getPoint(to), 0.15)}
      className="brain-sketch__path brain-sketch__path--connectivity"
      aria-hidden
    />
  ));
}

function RegionLabel({ region }: { region: BrainRegion }) {
  const offset = LABEL_OFFSETS[region.id] ?? { x: 0, y: -40 };
  const labelX = region.x + offset.x;
  const labelY = region.y + offset.y;
  const lineEndX = region.x + offset.x * 0.35;
  const lineEndY = region.y + offset.y * 0.35;

  return (
    <g className="brain-sketch__label" aria-hidden>
      <line
        x1={lineEndX}
        y1={lineEndY}
        x2={labelX + 40}
        y2={labelY + 8}
        className="brain-sketch__leader"
      />
      <text x={labelX} y={labelY} className="brain-sketch__label-title">
        {region.label}
      </text>
      <text x={labelX} y={labelY + 14} className="brain-sketch__label-hint">
        {region.anatomicalHint}
      </text>
    </g>
  );
}

function curvedPath(from: Point, to: Point, bend = 0.25): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = from.x + dx * 0.5 - dy * bend;
  const cy = from.y + dy * 0.5 + dx * bend;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}
