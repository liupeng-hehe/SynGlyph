"use client";

import dynamic from "next/dynamic";

const SynesthesiaBrainAtlas = dynamic(
  () =>
    import("./SynesthesiaBrainAtlas").then((m) => m.SynesthesiaBrainAtlas),
  {
    ssr: false,
    loading: () => (
      <div className="synesthesia-brain-atlas__empty" role="status">
        Loading Synesthesia Brain Atlas…
      </div>
    ),
  },
);

export function NeuralDiagramLoader() {
  return <SynesthesiaBrainAtlas />;
}
