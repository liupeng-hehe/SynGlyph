import type { Chapter } from "@/content/synesthesiaContent";

import { ExhibitWall } from "./ExhibitWall";
import { InducerConcurrent } from "./InducerConcurrent";
import { InteractionPlaceholder } from "./InteractionPlaceholder";
import { NeuralDiagramLoader } from "./NeuralDiagramLoader";
import { OpeningColorWords } from "./OpeningColorWords";
import { PersonalTransition } from "./PersonalTransition";
import { SenseBridge } from "./SenseBridge";

type Props = {
  chapterId: string;
  interaction: NonNullable<Chapter["interaction"]>;
};

export function InteractionRenderer({ chapterId, interaction }: Props) {
  if (interaction.type === "colorWords" && interaction.words?.length) {
    return (
      <div data-chapter-id={chapterId}>
        <OpeningColorWords words={interaction.words} />
      </div>
    );
  }

  if (interaction.type === "senseBridge") {
    return (
      <div data-chapter-id={chapterId}>
        <SenseBridge />
      </div>
    );
  }

  if (interaction.type === "inducerConcurrent") {
    return (
      <div data-chapter-id={chapterId}>
        <InducerConcurrent />
      </div>
    );
  }

  if (interaction.type === "neuralDiagram") {
    return (
      <div data-chapter-id={chapterId}>
        <NeuralDiagramLoader />
      </div>
    );
  }

  if (interaction.type === "exhibitWall") {
    return (
      <div data-chapter-id={chapterId}>
        <ExhibitWall />
      </div>
    );
  }

  if (interaction.type === "personalTransition") {
    return (
      <div data-chapter-id={chapterId}>
        <PersonalTransition />
      </div>
    );
  }

  return (
    <InteractionPlaceholder
      type={interaction.type}
      words={interaction.words}
    />
  );
}
