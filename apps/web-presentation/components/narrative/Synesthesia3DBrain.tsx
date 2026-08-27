"use client";

import { useEffect, useMemo, useState } from "react";

import {
  brainRegions3D,
  default3DFlowId,
  evidenceLevelLabels,
  globalNeuroDisclaimer,
  modelEducationNote,
  synesthesia3DFlows,
  tractographyNote,
} from "@/content/synesthesia3DFlows";

import {
  BrainScene3D,
  getRegionFlowColor,
  useBrainGlbAvailable,
  type CameraPreset,
} from "./BrainScene3D";
import { BrainSourceSup } from "./BrainSourceSup";
import { SynestheticOutputIcon } from "./SynestheticOutputIcon";

export type Synesthesia3DBrainProps = {
  defaultFlowId?: string;
};

const VIEW_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
];

const MAX_VISIBLE_CHIPS = 3;

const viewerEducationNote =
  "This 3D visualization is a simplified educational model. Highlighted regions indicate possible involvement discussed in the literature and are not a diagnostic map or measured individual brain scan.";

const pathwayTractNote =
  "The connecting routes are educational approximations, not measured fiber tracts.";

function firstSentence(text: string, maxLen = 140): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

function CompactChips({
  items,
  variant = "default",
}: {
  items: string[];
  variant?: "default" | "output";
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = items.length - MAX_VISIBLE_CHIPS;

  return (
    <div className="neuro-chips">
      {visible.map((item) => (
        <span
          key={item}
          className={`neuro-chip${variant === "output" ? " neuro-chip--output" : ""}`}
        >
          {item}
        </span>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          className="neuro-chip neuro-chip--more"
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}

export function Synesthesia3DBrain({
  defaultFlowId: initialFlowId = default3DFlowId,
}: Synesthesia3DBrainProps) {
  const [flowId, setFlowId] = useState(initialFlowId);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("default");
  const [resetToken, setResetToken] = useState(0);
  const hasGlb = useBrainGlbAvailable();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const activeFlow = useMemo(
    () => synesthesia3DFlows.find((f) => f.id === flowId) ?? synesthesia3DFlows[0],
    [flowId],
  );

  const activeRegionList = useMemo(
    () =>
      activeFlow.activeRegionIds.map((id, index) => ({
        index: index + 1,
        color: getRegionFlowColor(index + 1),
        region: brainRegions3D[id],
      })),
    [activeFlow.activeRegionIds],
  );

  const activeRegions = useMemo(
    () =>
      activeRegionList.map(({ index, color, region }) => ({
        id: region.id,
        index,
        label: region.label,
        color,
      })),
    [activeRegionList],
  );

  const pathwayFlow = useMemo(
    () =>
      activeRegionList
        .map((r) => `${r.index}. ${r.region.label}`)
        .join(" → "),
    [activeRegionList],
  );

  const sceneSummary = useMemo(() => {
    const names = activeRegionList.map((r) => r.region.label).join(", ");
    return `${activeFlow.inputName} may involve ${names}, evoking ${activeFlow.outputName.toLowerCase()}. Educational model only.`;
  }, [activeFlow.inputName, activeFlow.outputName, activeRegionList]);

  return (
    <section className="synesthesia-3d-brain" aria-labelledby="syn3d-title">
      <header className="neuro-hero">
        <p className="neuro-eyebrow">Neuroscience model</p>
        <h2 id="syn3d-title" className="neuro-hero__title">
          Input to Concurrent Experience
        </h2>
        <p className="neuro-hero__subtitle">
          Select a synesthesia type to explore possible brain-region involvement.
        </p>
      </header>

      <div
        className="neuro-type-scroller"
        role="tablist"
        aria-label="Synesthesia types"
      >
        {synesthesia3DFlows.map((flow) => {
          const isActive = flow.id === flowId;
          return (
            <button
              key={flow.id}
              type="button"
              role="tab"
              className={`neuro-type-btn${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => setFlowId(flow.id)}
            >
              <span>{flow.shortLabel}</span>
              {isActive && (
                <BrainSourceSup
                  sourceKeys={flow.sourceKeys}
                  className="neuro-type-btn__sources"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="neuro-flow-stage">
        <aside className="neuro-endpoint neuro-endpoint--input">
          <p className="neuro-endpoint__tag">Input / Inducer</p>
          <h3 className="neuro-endpoint__title">{activeFlow.inputName}</h3>
          <CompactChips items={activeFlow.inputExamples} />
          <p className="neuro-endpoint__desc">
            {firstSentence(activeFlow.inputDescription)}
          </p>
        </aside>

        <div className="neuro-viewer-column">
          <div className="neuro-viewer-column__head">
            <div>
              <h3 className="neuro-viewer-column__title">{activeFlow.label}</h3>
              <p className="neuro-viewer-column__meta">
                {activeFlow.shortLabel}
                <BrainSourceSup sourceKeys={activeFlow.sourceKeys} />
              </p>
            </div>
            <span
              className={`neuro-evidence neuro-evidence--${activeFlow.evidenceLevel}`}
            >
              {evidenceLevelLabels[activeFlow.evidenceLevel]}
            </span>
          </div>

          <div className="neuro-viewer-exhibit__canvas-block">
            {hasGlb === null ? (
              <div className="neuro-viewer-empty" role="status">
                <p>Loading viewer…</p>
              </div>
            ) : (
              <>
                {!hasGlb && (
                  <div className="neuro-viewer-empty" role="status">
                    <p className="neuro-viewer-empty__title">
                      Anatomical shell preview
                    </p>
                    <p className="neuro-viewer-empty__body">
                      Add <code>public/neuro/brain_surface.glb</code> for the
                      full surface model.
                    </p>
                  </div>
                )}
                <div className="neuro-canvas-wrap">
                  <BrainScene3D
                    activeRegions={activeRegions}
                    hasGlb={hasGlb}
                    cameraPreset={cameraPreset}
                    resetToken={resetToken}
                    reducedMotion={reducedMotion}
                  />
                  <div
                    className="neuro-camera-overlay"
                    aria-label="Camera views"
                  >
                    {VIEW_BUTTONS.map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        className={`neuro-camera-btn${cameraPreset === btn.id ? " is-selected" : ""}`}
                        onClick={() => setCameraPreset(btn.id)}
                      >
                        {btn.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="neuro-camera-btn"
                      onClick={() => {
                        setCameraPreset("default");
                        setResetToken((t) => t + 1);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="neuro-possible-pathway" aria-label="Possible pathway">
            <p className="neuro-possible-pathway__tag">Possible pathway</p>
            <p className="neuro-possible-pathway__flow">{pathwayFlow}</p>
          </div>

          <ol
            className="neuro-region-legend"
            aria-label="Numbered regions on the brain model"
          >
            {activeRegionList.map(({ index, color, region }) => (
              <li key={region.id}>
                <span
                  className="neuro-region-legend__num"
                  style={{ borderColor: color, color }}
                >
                  {index}
                </span>
                <span
                  className="neuro-region-legend__chip"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="neuro-region-legend__body">
                  <span className="neuro-region-legend__label">{region.label}</span>
                  <span className="neuro-region-legend__hint">
                    {region.anatomicalHint}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <p className="neuro-scene-summary" id="syn3d-scene-summary">
            {sceneSummary}
          </p>

          <div className="neuro-viewer-caution">
            <p>{viewerEducationNote}</p>
            <p>{pathwayTractNote}</p>
          </div>
        </div>

        <aside className="neuro-endpoint neuro-endpoint--output">
          <p className="neuro-endpoint__tag">Synesthetic feedback</p>
          <p className="neuro-endpoint__sublabel">Concurrent experience</p>
          <h3 className="neuro-endpoint__title">{activeFlow.outputName}</h3>
          <CompactChips items={activeFlow.outputExamples} variant="output" />
          <p className="neuro-endpoint__desc">
            {firstSentence(activeFlow.outputDescription)}
          </p>
          <p className="neuro-endpoint__summary">{activeFlow.pathwaySummary}</p>
        </aside>
      </div>

      <details className="neuro-details">
        <summary>Region details</summary>
        <ol className="neuro-legend-full" aria-label="Highlighted regions">
          {activeRegionList.map(({ index, color, region }) => (
            <li key={region.id} className="neuro-legend-full__item">
              <span
                className="neuro-legend-full__chip"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="neuro-legend-full__marker">{index}</span>
              <span className="neuro-legend-full__text">
                <strong>{region.label}</strong>
                <span>{region.anatomicalHint}</span>
                <span>{region.role}</span>
                <span>{region.hemisphere} hemisphere</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="neuro-details__icon">
          <SynestheticOutputIcon icon={activeFlow.outputIcon} />
        </div>
      </details>

      <details className="neuro-details">
        <summary>Scientific notes</summary>
        <div className="neuro-notes">
          <p>
            <strong>Input.</strong> {activeFlow.inputDescription}
          </p>
          <p>
            <strong>Feedback.</strong> {activeFlow.outputDescription}
          </p>
          <p className="neuro-notes__caution">{activeFlow.caution}</p>
          <p>{modelEducationNote}</p>
          <p>{tractographyNote}</p>
          <p className="neuro-notes__disclaimer">{globalNeuroDisclaimer}</p>
        </div>
      </details>
    </section>
  );
}
