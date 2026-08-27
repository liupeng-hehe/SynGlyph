export type OpeningColorWord = {
  text: string;
  auraColor: string;
  sensoryPath: string;
  description: string;
};

export const openingColorWordFallback: OpeningColorWord = {
  text: "",
  auraColor: "#B7C7FF",
  sensoryPath: "Word → Perception",
  description:
    "This word may carry a sensory association for some readers or synesthetes.",
};

export const openingColorWordByKey: Record<string, OpeningColorWord> = {
  blue: {
    text: "blue",
    auraColor: "#00B8D9",
    sensoryPath: "Color / Mood / Perception",
    description:
      "Blue begins as a color, but it can also behave like a mood, a metaphor, or a perceptual event.",
  },
  A: {
    text: "A",
    auraColor: "#FF6B6B",
    sensoryPath: "Letter → Color",
    description:
      "A single printed letter can become more than a shape. For some synesthetes, a letter may arrive with a stable color.",
  },
  Monday: {
    text: "Monday",
    auraColor: "#FFD447",
    sensoryPath: "Time → Color",
    description:
      "A weekday can feel colored, placed, or textured, even when no color is physically present.",
  },
  spring: {
    text: "spring",
    auraColor: "#2ECC71",
    sensoryPath: "Word → Season / Temperature / Color",
    description:
      "A word can carry temperature, brightness, and atmosphere before it becomes an image.",
  },
  echo: {
    text: "echo",
    auraColor: "#7B61FF",
    sensoryPath: "Sound → Space / Color",
    description:
      "Sound can feel spatial. An echo may seem to leave a shape, a distance, or a colored trace.",
  },
  silence: {
    text: "silence",
    auraColor: "#B7C7FF",
    sensoryPath: "Absence of Sound → Texture",
    description:
      "Even absence can feel sensory. Silence may feel sharp, soft, heavy, pale, or blue.",
  },
};

export function resolveOpeningColorWord(text: string): OpeningColorWord {
  const entry = openingColorWordByKey[text];
  if (entry) return entry;
  return { ...openingColorWordFallback, text };
}
