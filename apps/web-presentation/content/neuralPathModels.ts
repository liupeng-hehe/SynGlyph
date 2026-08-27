export type NeuralPathModel = {
  id: string;
  toggleLabel: string;
  stimulusLabel: string;
  recognitionLabel: string;
  meaningLabel: string;
  concurrentLabel: string;
  concurrentAura: string;
  branchCaption: string;
};

export const neuralPathModels: NeuralPathModel[] = [
  {
    id: "grapheme-color",
    toggleLabel: "Grapheme → Color",
    stimulusLabel: "Black letter A",
    recognitionLabel: "Letter recognition",
    meaningLabel: "Meaning",
    concurrentLabel: "Color experience",
    concurrentAura: "#00B8D9",
    branchCaption: "One possible model, not the only explanation.",
  },
  {
    id: "sound-color",
    toggleLabel: "Sound → Color",
    stimulusLabel: "A piano note",
    recognitionLabel: "Sound recognition",
    meaningLabel: "Interpretation",
    concurrentLabel: "Color experience",
    concurrentAura: "#7B61FF",
    branchCaption: "A possible path for some sound-color synesthesia.",
  },
  {
    id: "time-space",
    toggleLabel: "Time → Space",
    stimulusLabel: "Monday",
    recognitionLabel: "Time recognition",
    meaningLabel: "Meaning",
    concurrentLabel: "Spatial position",
    concurrentAura: "#2ECC71",
    branchCaption: "One model for sequence-space experiences.",
  },
  {
    id: "word-taste",
    toggleLabel: "Word → Taste",
    stimulusLabel: "A word",
    recognitionLabel: "Word recognition",
    meaningLabel: "Meaning",
    concurrentLabel: "Taste experience",
    concurrentAura: "#FF9F1C",
    branchCaption: "A possible lexical-gustatory pathway.",
  },
];

export const defaultNeuralPathModelId = "grapheme-color";

export const consistencyDemoColors = [
  { id: "red-a", label: "Red A", hex: "#C41E3A" },
  { id: "red-b", label: "Red B", hex: "#E85D5D" },
  { id: "red-c", label: "Red C", hex: "#8B1E1E" },
  { id: "red-d", label: "Red D", hex: "#FF6B6B" },
] as const;
