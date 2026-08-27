export type ConcurrentItem = {
  label: string;
  sensoryDomain: string;
  auraColor: string;
  description: string;
};

export type InducerConcurrentExample = {
  id: string;
  inducerLabel: string;
  inducerType: string;
  stimulusExamples: string[];
  summary: string;
  concurrents: ConcurrentItem[];
  caution?: string;
};

export const inducerConcurrentExamples: InducerConcurrentExample[] = [
  {
    id: "letter",
    inducerLabel: "Letter",
    inducerType: "Grapheme",
    stimulusExamples: ["A", "M", "7"],
    summary:
      "A printed letter or number may trigger an additional color experience for some synesthetes.",
    concurrents: [
      {
        label: "Color",
        sensoryDomain: "Vision",
        auraColor: "#FF6B6B",
        description:
          "The color is not physically printed on the page, but may appear as part of the person's experience.",
      },
      {
        label: "Spatial presence",
        sensoryDomain: "Space",
        auraColor: "#7B61FF",
        description:
          "Some people may experience the color as located around the letter or in the mind's eye.",
      },
    ],
    caution: "Associations vary from person to person.",
  },
  {
    id: "sound",
    inducerLabel: "Sound",
    inducerType: "Auditory stimulus",
    stimulusExamples: ["a piano note", "a voice", "a bell"],
    summary:
      "A sound may evoke color, shape, movement, or spatial texture for some synesthetes.",
    concurrents: [
      {
        label: "Color",
        sensoryDomain: "Vision",
        auraColor: "#00B8D9",
        description: "A tone may appear with a color-like quality.",
      },
      {
        label: "Shape",
        sensoryDomain: "Form",
        auraColor: "#7B61FF",
        description:
          "A sound may feel round, sharp, expanding, or fragmented.",
      },
      {
        label: "Movement",
        sensoryDomain: "Motion",
        auraColor: "#FFD447",
        description:
          "The concurrent may feel like it moves, pulses, or fades.",
      },
    ],
  },
  {
    id: "weekday",
    inducerLabel: "Weekday",
    inducerType: "Time sequence",
    stimulusExamples: ["Monday", "Friday", "Sunday"],
    summary:
      "A weekday may feel colored, positioned, or textured even though it is an abstract unit of time.",
    concurrents: [
      {
        label: "Color",
        sensoryDomain: "Vision",
        auraColor: "#FFD447",
        description: "A day may carry a stable color association.",
      },
      {
        label: "Spatial position",
        sensoryDomain: "Space",
        auraColor: "#2ECC71",
        description:
          "Some people experience days or months as arranged in space.",
      },
    ],
  },
  {
    id: "word",
    inducerLabel: "Word",
    inducerType: "Language",
    stimulusExamples: ["spring", "silence", "window"],
    summary:
      "A word may evoke a taste, texture, temperature, color, or atmosphere.",
    concurrents: [
      {
        label: "Taste",
        sensoryDomain: "Gustatory",
        auraColor: "#FF9F1C",
        description: "Some words may carry taste-like qualities.",
      },
      {
        label: "Texture",
        sensoryDomain: "Touch",
        auraColor: "#B7C7FF",
        description:
          "A word may feel soft, sharp, heavy, grainy, or smooth.",
      },
      {
        label: "Temperature",
        sensoryDomain: "Touch",
        auraColor: "#00B8D9",
        description: "A word may feel warm, cold, pale, or dense.",
      },
    ],
  },
  {
    id: "number",
    inducerLabel: "Number",
    inducerType: "Sequence / Symbol",
    stimulusExamples: ["3", "8", "42"],
    summary:
      "Numbers may evoke color, personality, location, or spatial sequence.",
    concurrents: [
      {
        label: "Color",
        sensoryDomain: "Vision",
        auraColor: "#FF4FD8",
        description: "A number may have a stable color for one person.",
      },
      {
        label: "Spatial order",
        sensoryDomain: "Space",
        auraColor: "#7B61FF",
        description: "A number sequence may appear as a spatial layout.",
      },
    ],
  },
  {
    id: "month",
    inducerLabel: "Month",
    inducerType: "Calendar sequence",
    stimulusExamples: ["January", "April", "October"],
    summary:
      "Months may appear as colors, textures, or positions in a mental calendar.",
    concurrents: [
      {
        label: "Color",
        sensoryDomain: "Vision",
        auraColor: "#2ECC71",
        description: "A month may carry a color-like quality.",
      },
      {
        label: "Spatial calendar",
        sensoryDomain: "Space",
        auraColor: "#FFD447",
        description:
          "Months may feel arranged around the body, on a line, or in a loop.",
      },
    ],
  },
];

export const defaultInducerId = "letter";

export function resolveInducerExample(
  id: string,
): InducerConcurrentExample | undefined {
  return inducerConcurrentExamples.find((example) => example.id === id);
}
