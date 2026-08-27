export type SenseExample = {
  phrase: string;
  from: string;
  to: string;
  explanation: string;
};

export const senseExamples: SenseExample[] = [
  {
    phrase: "a sweet voice",
    from: "Taste",
    to: "Sound",
    explanation:
      'The word "sweet" belongs to taste, while "voice" belongs to sound. Together, they create a cross-sensory image.',
  },
  {
    phrase: "a cold color",
    from: "Touch / Temperature",
    to: "Vision",
    explanation:
      "Temperature is used to describe a visual quality, making color feel physical.",
  },
  {
    phrase: "a sharp silence",
    from: "Touch / Pain",
    to: "Absence of Sound",
    explanation:
      "A tactile or painful sensation is used to describe the emotional force of silence.",
  },
  {
    phrase: "a warm sentence",
    from: "Temperature",
    to: "Language",
    explanation:
      "A sentence is given a bodily temperature, turning language into something felt.",
  },
  {
    phrase: "a bright tone",
    from: "Vision",
    to: "Sound",
    explanation:
      "Brightness, a visual quality, is used to describe the character of a sound.",
  },
];
