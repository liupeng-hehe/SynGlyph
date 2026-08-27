"use client";

import { useMemo, useState, type CSSProperties } from "react";

import {
  backgroundFibers,
  buildClusterVisuals,
  buildPathwayFibers,
} from "@/content/neuralFiberPaths";
import {
  BRAIN_SILHOUETTE_PATH,
  INPUT_ANCHOR,
  defaultFlowId,
  neuralClusters,
  synesthesiaFlows,
  type NeuralCluster,
  type NeuralClusterId,
} from "@/content/synesthesiaTypeFlows";

import { SynestheticOutputIcon } from "./SynestheticOutputIcon";

export type SynesthesiaFiberMapProps = {
  defaultFlowId?: string;
};

const clusterVisuals = buildClusterVisuals(neuralClusters);

type CalloutLayout = {
  labelX: number;
  labelY: number;
  textAnchor: "start" | "end" | "middle";
};

function getCalloutLayout(cluster: NeuralCluster, index: number): CalloutLayout {
  if (cluster.x >= 520) {
    return { labelX: 868, labelY: 72 + index * 52, textAnchor: "end" };
  }
  if (cluster.x <= 320) {
    return { labelX: 32, labelY: 72 + index * 52, textAnchor: "start" };
  }
  if (cluster.y <= 200) {
    return { labelX: 120 + index * 165, labelY: 48, textAnchor: "middle" };
  }
  return { labelX: 120 + index * 165, labelY: 538, textAnchor: "middle" };
}

export function SynesthesiaFiberMap({
  defaultFlowId: initialFlowId = defaultFlowId,
}: SynesthesiaFiberMapProps) {
  const [flowId, setFlowId] = useState(initialFlowId);

  const clusterMap = useMemo(
    () =>
      Object.fromEntries(neuralClusters.map((c) => [c.id, c])) as Record<
        NeuralClusterId,
        NeuralCluster
      >,
    [],
  );

  const activeFlow = useMemo(
    () => synesthesiaFlows.find((f) => f.id === flowId) ?? synesthesiaFlows[0],
    [flowId],
  );

  const activeClusterList = useMemo(
    () =>
      activeFlow.activeClusters.map((id, index) => ({
        index: index + 1,
        cluster: clusterMap[id],
      })),
    [activeFlow.activeClusters, clusterMap],
  );

  const activeSet = useMemo(
    () => new Set(activeFlow.activeClusters),
    [activeFlow.activeClusters],
  );

  const pathwaySegments = useMemo(() => {
    const points = [
      INPUT_ANCHOR,
      ...activeFlow.activeClusters.map((id) => {
        const c = clusterMap[id];
        return { x: c.x, y: c.y };
      }),
    ];
    const segments: { paths: string[]; seed: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({
        paths: buildPathwayFibers(points[i], points[i + 1], 4000 + i * 97, 4),
        seed: 4000 + i * 97,
      });
    }
    return segments;
  }, [activeFlow.activeClusters, clusterMap]);

  const svgDescription = useMemo(() => {
    const names = activeClusterList
      .map((item) => `${item.index}. ${item.cluster.label}`)
      .join("; ");
    return `Neural fiber connectivity map for ${activeFlow.label}. Possible active pathway: ${names}.`;
  }, [activeFlow.label, activeClusterList]);

  return (
    <section
      className="synesthesia-fiber-map"
      aria-labelledby="fiber-map-title"
    >
      <header className="synesthesia-fiber-map__header">
        <p className="synesthesia-fiber-map__hint">
          Input source → neural pathways → synesthetic feedback
        </p>
        <h3 id="fiber-map-title" className="synesthesia-fiber-map__title">
          Proposed synesthetic pathways
        </h3>
        <p className="synesthesia-fiber-map__subtitle">
          Select a synesthesia type to see how an inducer may be linked to a
          concurrent experience.
        </p>
      </header>

      <div
        className="synesthesia-fiber-map__tabs"
        role="tablist"
        aria-label="Synesthesia types"
      >
        {synesthesiaFlows.map((flow) => {
          const isActive = flow.id === flowId;
          return (
            <button
              key={flow.id}
              type="button"
              role="tab"
              className={`synesthesia-fiber-map__tab${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              aria-current={isActive ? "true" : undefined}
              onClick={() => setFlowId(flow.id)}
            >
              {flow.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="synesthesia-fiber-map__layout">
        <div className="synesthesia-fiber-map__map-card">
          <NeuralFieldSvg
            activeSet={activeSet}
            activeClusterList={activeClusterList}
            pathwaySegments={pathwaySegments}
            flowLabel={activeFlow.label}
            svgDescription={svgDescription}
          />

          <ol
            className="synesthesia-fiber-map__legend"
            aria-label="Active neural pathway"
          >
            <li className="synesthesia-fiber-map__legend-heading">
              Active pathway
            </li>
            {activeClusterList.map(({ index, cluster }) => (
              <li key={cluster.id} className="synesthesia-fiber-map__legend-item">
                <span className="synesthesia-fiber-map__legend-marker">
                  {index}
                </span>
                <span className="synesthesia-fiber-map__legend-text">
                  <strong>{cluster.label}</strong>
                  <span className="synesthesia-fiber-map__legend-hint">
                    {cluster.anatomicalHint}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <aside className="synesthesia-fiber-map__side-panel">
          <div className="synesthesia-fiber-map__side-card">
            <p className="synesthesia-fiber-map__side-label">Input Source</p>
            <p className="synesthesia-fiber-map__side-sublabel">Inducer</p>
            <h4 className="synesthesia-fiber-map__side-title">
              {activeFlow.inputName}
            </h4>
            <div className="synesthesia-fiber-map__chips">
              {activeFlow.inputExamples.map((ex) => (
                <span key={ex} className="synesthesia-fiber-map__chip">
                  {ex}
                </span>
              ))}
            </div>
            <p className="synesthesia-fiber-map__side-copy">
              {activeFlow.inputDescription}
            </p>
          </div>

          <div className="synesthesia-fiber-map__side-card synesthesia-fiber-map__side-card--output">
            <p className="synesthesia-fiber-map__side-label">
              Synesthetic Feedback
            </p>
            <p className="synesthesia-fiber-map__side-sublabel">
              Concurrent Experience
            </p>
            <h4 className="synesthesia-fiber-map__side-title">
              {activeFlow.outputName}
            </h4>
            <SynestheticOutputIcon icon={activeFlow.outputIcon} />
            <div className="synesthesia-fiber-map__chips">
              {activeFlow.outputExamples.map((ex) => (
                <span
                  key={ex}
                  className="synesthesia-fiber-map__chip synesthesia-fiber-map__chip--output"
                >
                  {ex}
                </span>
              ))}
            </div>
            <p className="synesthesia-fiber-map__side-copy">
              {activeFlow.outputDescription}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

type NeuralFieldProps = {
  activeSet: Set<NeuralClusterId>;
  activeClusterList: { index: number; cluster: NeuralCluster }[];
  pathwaySegments: { paths: string[]; seed: number }[];
  flowLabel: string;
  svgDescription: string;
};

function NeuralFieldSvg({
  activeSet,
  activeClusterList,
  pathwaySegments,
  flowLabel,
  svgDescription,
}: NeuralFieldProps) {
  return (
    <svg
      className="neural-field"
      viewBox="0 0 900 560"
      role="img"
      aria-label={svgDescription}
    >
      <defs>
        <clipPath id="brain-silhouette-clip">
          <path d={BRAIN_SILHOUETTE_PATH} />
        </clipPath>
        <filter id="cluster-glow-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="path-glow-filter" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect
        x="0"
        y="0"
        width="900"
        height="560"
        className="neural-field__paper"
      />

      <path
        className="neural-field__silhouette"
        d={BRAIN_SILHOUETTE_PATH}
      />

      <g clipPath="url(#brain-silhouette-clip)">
        {backgroundFibers.map((fiber, i) => (
          <path
            key={`bg-${i}`}
            className="neural-field__fiber"
            d={fiber.d}
            stroke={fiber.color ?? undefined}
            strokeWidth={fiber.width}
          />
        ))}

        {neuralClusters.map((cluster) => {
          const isActive = activeSet.has(cluster.id);
          const visual = clusterVisuals[cluster.id];
          const style = { "--cluster-color": cluster.color } as CSSProperties;

          return (
            <g
              key={cluster.id}
              className={`neural-field__cluster${isActive ? " is-active" : ""}`}
              style={style}
            >
              {isActive && (
                <circle
                  className="neural-field__cluster-glow"
                  cx={cluster.x}
                  cy={cluster.y}
                  r="32"
                  filter="url(#cluster-glow-filter)"
                />
              )}
              {visual.branches.map((d, bi) => (
                <path
                  key={`b-${bi}`}
                  className="neural-field__cluster-branch"
                  d={d}
                />
              ))}
              {visual.dots.map((dot, di) => (
                <circle
                  key={`d-${di}`}
                  className="neural-field__cluster-dot"
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.r}
                />
              ))}
            </g>
          );
        })}

        {pathwaySegments.map((segment, si) =>
          segment.paths.map((d, pi) => (
            <g key={`path-${si}-${pi}`}>
              <path
                className="neural-field__path-glow"
                d={d}
                filter="url(#path-glow-filter)"
              />
              <path
                className={`neural-field__path neural-field__path--segment-${si}`}
                d={d}
              />
            </g>
          )),
        )}
      </g>

      <g className="neural-field__input-anchor">
        <circle
          cx={INPUT_ANCHOR.x}
          cy={INPUT_ANCHOR.y}
          r="5"
          className="neural-field__input-dot"
        />
        <text
          x={INPUT_ANCHOR.x - 8}
          y={INPUT_ANCHOR.y + 22}
          className="neural-field__input-label"
          textAnchor="middle"
        >
          inducer
        </text>
      </g>

      {activeClusterList.map(({ index, cluster }) => {
        const layout = getCalloutLayout(cluster, index - 1);
        return (
          <g key={`callout-${cluster.id}`} className="neural-field__callout">
            <circle
              className="neural-field__callout-marker"
              cx={cluster.x}
              cy={cluster.y}
              r="10"
            />
            <text
              className="neural-field__callout-marker-label"
              x={cluster.x}
              y={cluster.y + 3.5}
              textAnchor="middle"
            >
              {index}
            </text>
            <line
              className="neural-field__callout-line"
              x1={cluster.x}
              y1={cluster.y}
              x2={layout.labelX + (layout.textAnchor === "end" ? -8 : layout.textAnchor === "start" ? 8 : 0)}
              y2={layout.labelY - 4}
            />
            <text
              className="neural-field__callout-label"
              x={layout.labelX}
              y={layout.labelY}
              textAnchor={layout.textAnchor}
            >
              {cluster.label}
            </text>
            <text
              className="neural-field__callout-hint"
              x={layout.labelX}
              y={layout.labelY + 11}
              textAnchor={layout.textAnchor}
            >
              {cluster.anatomicalHint}
            </text>
          </g>
        );
      })}

      <text x="-9999" y="-9999" aria-hidden="true">
        {flowLabel}
      </text>
    </svg>
  );
}
