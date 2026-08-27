"use client";

import { useEffect, useMemo, useState } from "react";

import {
  atlasEducationDisclaimer,
  brainRegions3D,
  default3DFlowId,
  evidenceLevelLabels,
  synesthesia3DFlows,
} from "@/content/synesthesia3DFlows";

import {
  getRegionFlowColor,
  useBrainGlbAvailable,
  type CameraPreset,
} from "./BrainScene3D";
import { BrainSourceSup } from "./BrainSourceSup";
import {
  SegmentedBrainScene3D,
  useSegmentedBrainAvailable,
} from "./SegmentedBrainScene3D";

export type SynesthesiaBrainAtlasProps = {
  defaultFlowId?: string;
};

const VIEW_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
];

function firstSentence(text: string, maxLen = 160): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

export function SynesthesiaBrainAtlas({
  defaultFlowId: initialFlowId = default3DFlowId,
}: SynesthesiaBrainAtlasProps) {
  const [flowId, setFlowId] = useState(initialFlowId);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("default");
  const [resetToken, setResetToken] = useState(0);
  const [shellOpacity, setShellOpacity] = useState(0.42);
  const [animPhase, setAnimPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const hasSegmented = useSegmentedBrainAvailable();
  const hasSurfaceShell = useBrainGlbAvailable();

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

  const pathwayLabel = useMemo(
    () =>
      activeRegionList
        .map((r) => `${r.index}. ${r.region.label}`)
        .join(" → "),
    [activeRegionList],
  );

  useEffect(() => {
    setAnimPhase(0);
  }, [flowId]);

  useEffect(() => {
    if (reducedMotion || activeRegionList.length === 0) return;
    const interval = window.setInterval(() => {
      setAnimPhase((p) => (p + 1) % (activeRegionList.length + 1));
    }, 1400);
    return () => window.clearInterval(interval);
  }, [activeRegionList.length, reducedMotion, flowId]);

  const viewerReady = hasSegmented !== null && hasSurfaceShell !== null;

  return (
    <section
      className="synesthesia-brain-atlas"
      aria-labelledby="brain-atlas-title"
    >
      <header className="synesthesia-brain-atlas__header">
        <p className="synesthesia-brain-atlas__hint">Synesthesia Brain Atlas</p>
        <h2 id="brain-atlas-title" className="synesthesia-brain-atlas__title">
          Possible pathways across the brain
        </h2>
        <p className="synesthesia-brain-atlas__subtitle">
          Select a synesthesia type to highlight proposed regions on a rotatable
          3D model. Colors follow the pathway order—not a clinical scan.
        </p>
      </header>

      <div className="synesthesia-brain-atlas__stage">
        <nav
          className="synesthesia-brain-atlas__selector"
          aria-label="Synesthesia types"
        >
          <ul className="synesthesia-brain-atlas__selector-list" role="tablist">
            {synesthesia3DFlows.map((flow) => {
              const isActive = flow.id === flowId;
              return (
                <li key={flow.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`synesthesia-brain-atlas__selector-btn${isActive ? " is-active" : ""}`}
                    onClick={() => setFlowId(flow.id)}
                  >
                    {flow.shortLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="synesthesia-brain-atlas__brain-card">
          <div className="synesthesia-brain-atlas__viewer-head">
            <div>
              <h3 className="synesthesia-brain-atlas__viewer-title">
                {activeFlow.label}
              </h3>
              <p className="synesthesia-brain-atlas__viewer-meta">
                {activeFlow.shortLabel}
                <BrainSourceSup sourceKeys={activeFlow.sourceKeys} />
              </p>
            </div>
            <span
              className={`synesthesia-brain-atlas__evidence synesthesia-brain-atlas__evidence--${activeFlow.evidenceLevel}`}
            >
              {evidenceLevelLabels[activeFlow.evidenceLevel]}
            </span>
          </div>

          <div className="synesthesia-brain-atlas__canvas-wrap">
            {!viewerReady ? (
              <div
                className="synesthesia-brain-atlas__empty"
                role="status"
                aria-live="polite"
              >
                Loading brain atlas…
              </div>
            ) : (
              <>
                <SegmentedBrainScene3D
                  activeRegionIds={activeFlow.activeRegionIds}
                  hasSegmentedModel={Boolean(hasSegmented)}
                  hasSurfaceShell={Boolean(hasSurfaceShell)}
                  shellOpacity={shellOpacity}
                  cameraPreset={cameraPreset}
                  resetToken={resetToken}
                  reducedMotion={reducedMotion}
                  animPhase={animPhase}
                />
                <div
                  className="synesthesia-brain-atlas__camera"
                  aria-label="Camera views"
                >
                  {VIEW_BUTTONS.map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      className={`synesthesia-brain-atlas__camera-btn${cameraPreset === btn.id ? " is-selected" : ""}`}
                      onClick={() => setCameraPreset(btn.id)}
                    >
                      {btn.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="synesthesia-brain-atlas__camera-btn"
                    onClick={() => {
                      setCameraPreset("default");
                      setResetToken((t) => t + 1);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </>
            )}
          </div>

          <label className="synesthesia-brain-atlas__opacity">
            <span>Surface opacity</span>
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.01}
              value={shellOpacity}
              onChange={(e) => setShellOpacity(Number(e.target.value))}
            />
          </label>
        </div>

        <aside
          className="synesthesia-brain-atlas__side-panel"
          aria-label="Selected synesthesia explanation"
        >
          <div className="synesthesia-brain-atlas__side-card">
            <p className="synesthesia-brain-atlas__side-label">Selected type</p>
            <h3 className="synesthesia-brain-atlas__side-title">
              {activeFlow.shortLabel}
            </h3>
            <p className="synesthesia-brain-atlas__pathway-label">
              {pathwayLabel}
            </p>
            <span
              className={`synesthesia-brain-atlas__evidence synesthesia-brain-atlas__evidence--${activeFlow.evidenceLevel}`}
            >
              {evidenceLevelLabels[activeFlow.evidenceLevel]}
            </span>

            <p className="synesthesia-brain-atlas__side-label synesthesia-brain-atlas__side-label--spaced">
              Input / Inducer
            </p>
            <p className="synesthesia-brain-atlas__side-copy">
              <strong>{activeFlow.inputName}</strong>
              {" — "}
              {firstSentence(activeFlow.inputDescription)}
            </p>

            <p className="synesthesia-brain-atlas__side-label synesthesia-brain-atlas__side-label--spaced">
              Highlighted regions
            </p>
            <ol className="synesthesia-brain-atlas__region-list">
              {activeRegionList.map(({ index, color, region }) => (
                <li key={region.id}>
                  <span
                    className="synesthesia-brain-atlas__region-swatch"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="synesthesia-brain-atlas__region-num">
                    {index}
                  </span>
                  <span>{region.label}</span>
                </li>
              ))}
            </ol>

            <p className="synesthesia-brain-atlas__side-label synesthesia-brain-atlas__side-label--spaced">
              Synesthetic feedback
            </p>
            <p className="synesthesia-brain-atlas__side-sublabel">
              Concurrent experience
            </p>
            <p className="synesthesia-brain-atlas__side-copy">
              <strong>{activeFlow.outputName}</strong>
              {" — "}
              {firstSentence(activeFlow.outputDescription)}
            </p>

            <p className="synesthesia-brain-atlas__caution">
              {firstSentence(activeFlow.caution)}
              <BrainSourceSup sourceKeys={activeFlow.sourceKeys} />
            </p>
          </div>
        </aside>

        <footer className="synesthesia-brain-atlas__footer">
          <ol
            className="synesthesia-brain-atlas__legend"
            aria-label="Region legend for highlighted pathway"
          >
            {activeRegionList.map(({ index, color, region }) => (
              <li
                key={region.id}
                className="synesthesia-brain-atlas__legend-item"
              >
                <span
                  className="synesthesia-brain-atlas__legend-num"
                  style={{ borderColor: color, color }}
                >
                  {index}
                </span>
                <span
                  className="synesthesia-brain-atlas__legend-chip"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="synesthesia-brain-atlas__legend-text">
                  <strong>{region.label}</strong>
                  <span className="synesthesia-brain-atlas__legend-hint">
                    {region.anatomicalHint}
                  </span>
                  <span className="synesthesia-brain-atlas__legend-role">
                    {region.role}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="synesthesia-brain-atlas__disclaimer">
            {atlasEducationDisclaimer}
          </p>
        </footer>
      </div>
    </section>
  );
}
