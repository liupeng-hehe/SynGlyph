import type { InteractionType } from "@/content/synesthesiaContent";

const PHASE_MAP: Record<InteractionType, string> = {
  colorWords: "Phase 3",
  senseBridge: "Phase 4",
  inducerConcurrent: "Phase 5",
  neuralDiagram: "Phase 6",
  exhibitWall: "Phase 7",
  personalTransition: "Phase 8",
};

type Props = {
  type: InteractionType;
  words?: string[];
};

export function InteractionPlaceholder({ type, words }: Props) {
  return (
    <aside
      className="narrative-card p-6"
      aria-label={`Interaction placeholder: ${type}`}
    >
      <p className="interaction-placeholder__hint m-0 font-body text-xs font-medium uppercase tracking-[0.18em]">
        Interaction · {type}
      </p>
      <p className="interaction-placeholder__lead mt-3 font-body text-sm leading-relaxed">
        Interactive component coming in {PHASE_MAP[type]}.
      </p>
      {words && words.length > 0 ? (
        <p className="mt-4 font-body text-sm text-[color:var(--text-body)]">
          Words: {words.join(", ")}
        </p>
      ) : null}
    </aside>
  );
}
