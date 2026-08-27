export type BrainRegionId =
  | "visualInput"
  | "graphemeRecognition"
  | "colorExperience"
  | "auditoryProcessing"
  | "parietalBinding"
  | "spatialMapping"
  | "languageSemantic"
  | "conceptualAssociation";

export type BrainRegion = {
  id: BrainRegionId;
  label: string;
  anatomicalHint: string;
  shortDescription: string;
  color: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
};

export type BrainPathSegment = {
  from: BrainRegionId | "stimulus";
  to: BrainRegionId | "concurrent";
  kind: "ordinary" | "synesthetic" | "feedback";
};

export type BrainMode = {
  id: string;
  label: string;
  shortLabel: string;
  stimulus: string;
  concurrent: string;
  summary: string;
  activeRegions: BrainRegionId[];
  path: BrainPathSegment[];
  caption: string;
  caution: string;
};

export type NeuroscienceMechanism = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  visualHint: "pathway" | "connectivity" | "projector" | "consistency";
  caution: string;
};

export const brainRegions: BrainRegion[] = [
  {
    id: "visualInput",
    label: "Visual input",
    anatomicalHint: "early visual processing",
    shortDescription: "Incoming visual information enters the system.",
    color: "#B7C7FF",
    x: 165,
    y: 276,
    rx: 56,
    ry: 34,
  },
  {
    id: "graphemeRecognition",
    label: "Grapheme recognition",
    anatomicalHint: "ventral occipito-temporal region",
    shortDescription:
      "Letters, numbers, and symbols are recognized as meaningful forms.",
    color: "#FFB6B6",
    x: 286,
    y: 318,
    rx: 66,
    ry: 36,
  },
  {
    id: "colorExperience",
    label: "Color experience",
    anatomicalHint: "ventral visual cortex / V4",
    shortDescription:
      "A color-like concurrent may appear even when color is not physically present.",
    color: "#00B8D9",
    x: 348,
    y: 246,
    rx: 58,
    ry: 38,
  },
  {
    id: "auditoryProcessing",
    label: "Auditory processing",
    anatomicalHint: "superior temporal region",
    shortDescription: "Sounds, voices, or music are processed as auditory input.",
    color: "#C9B7FF",
    x: 440,
    y: 306,
    rx: 70,
    ry: 38,
  },
  {
    id: "parietalBinding",
    label: "Binding / integration",
    anatomicalHint: "parietal cortex",
    shortDescription:
      "A possible integration hub for linking features, attention, and multisensory information.",
    color: "#FFD447",
    x: 410,
    y: 164,
    rx: 78,
    ry: 44,
  },
  {
    id: "spatialMapping",
    label: "Spatial mapping",
    anatomicalHint: "parietal / spatial representation",
    shortDescription:
      "Sequences such as days, months, or numbers may be arranged in mental space.",
    color: "#2ECC71",
    x: 512,
    y: 148,
    rx: 64,
    ry: 36,
  },
  {
    id: "languageSemantic",
    label: "Language / meaning",
    anatomicalHint: "semantic association",
    shortDescription:
      "Words and concepts are interpreted beyond their visual or auditory form.",
    color: "#FF9F1C",
    x: 535,
    y: 238,
    rx: 70,
    ry: 38,
  },
  {
    id: "conceptualAssociation",
    label: "Conceptual association",
    anatomicalHint: "distributed conceptual network",
    shortDescription:
      "Concepts may connect to texture, atmosphere, color, or other qualities.",
    color: "#FF4FD8",
    x: 292,
    y: 178,
    rx: 68,
    ry: 36,
  },
];

export const brainModes: BrainMode[] = [
  {
    id: "letter-color",
    label: "Letter → Color",
    shortLabel: "Letter",
    stimulus: "Black letter A",
    concurrent: "Color experience",
    summary:
      "A printed grapheme may be recognized as a symbol while also evoking a color-like concurrent for some synesthetes.",
    activeRegions: [
      "visualInput",
      "graphemeRecognition",
      "parietalBinding",
      "colorExperience",
    ],
    path: [
      { from: "stimulus", to: "visualInput", kind: "ordinary" },
      { from: "visualInput", to: "graphemeRecognition", kind: "ordinary" },
      {
        from: "graphemeRecognition",
        to: "parietalBinding",
        kind: "synesthetic",
      },
      { from: "parietalBinding", to: "colorExperience", kind: "feedback" },
    ],
    caption:
      "One possible account: symbolic recognition may recruit additional pathways associated with color experience and feature binding.",
    caution:
      "Associations vary from person to person. This is a simplified model, not a universal mechanism.",
  },
  {
    id: "sound-color",
    label: "Sound → Color",
    shortLabel: "Sound",
    stimulus: "Piano note",
    concurrent: "Color or shape",
    summary:
      "An auditory stimulus may evoke a visual concurrent such as color, shape, motion, or spatial texture.",
    activeRegions: [
      "auditoryProcessing",
      "parietalBinding",
      "colorExperience",
    ],
    path: [
      { from: "stimulus", to: "auditoryProcessing", kind: "ordinary" },
      {
        from: "auditoryProcessing",
        to: "parietalBinding",
        kind: "synesthetic",
      },
      { from: "parietalBinding", to: "colorExperience", kind: "feedback" },
    ],
    caption:
      "Sound-color synesthesia can be shown as auditory processing plus a possible visual concurrent pathway.",
    caution:
      "The visual result is personal and may not be the same across synesthetes.",
  },
  {
    id: "weekday-space",
    label: "Weekday → Space",
    shortLabel: "Weekday",
    stimulus: "Monday",
    concurrent: "Spatial position",
    summary:
      "An abstract time sequence may appear as a spatial layout, direction, loop, or mental map.",
    activeRegions: [
      "languageSemantic",
      "parietalBinding",
      "spatialMapping",
    ],
    path: [
      { from: "stimulus", to: "languageSemantic", kind: "ordinary" },
      {
        from: "languageSemantic",
        to: "parietalBinding",
        kind: "synesthetic",
      },
      { from: "parietalBinding", to: "spatialMapping", kind: "feedback" },
    ],
    caption:
      "Time-space or sequence-space synesthesia can be visualized as a link between conceptual time and spatial mapping.",
    caution:
      "Spatial forms are often highly individual and should not be treated as a universal calendar map.",
  },
  {
    id: "word-texture",
    label: "Word → Texture",
    shortLabel: "Word",
    stimulus: "silence",
    concurrent: "Texture or atmosphere",
    summary:
      "A word may evoke a tactile, thermal, emotional, or atmospheric concurrent.",
    activeRegions: [
      "visualInput",
      "languageSemantic",
      "conceptualAssociation",
      "parietalBinding",
    ],
    path: [
      { from: "stimulus", to: "visualInput", kind: "ordinary" },
      { from: "visualInput", to: "languageSemantic", kind: "ordinary" },
      {
        from: "languageSemantic",
        to: "conceptualAssociation",
        kind: "synesthetic",
      },
      {
        from: "conceptualAssociation",
        to: "parietalBinding",
        kind: "feedback",
      },
    ],
    caption:
      "Word-based concurrents may involve meaning, memory, attention, and conceptual association rather than a single sensory area.",
    caution:
      "This mode is intentionally conceptual. It should not be shown as one fixed anatomical pathway.",
  },
];

export const neuroscienceMechanisms: NeuroscienceMechanism[] = [
  {
    id: "cross-activation",
    title: "Cross-Activation",
    shortTitle: "Cross-Activation",
    visualHint: "pathway",
    description:
      "One model suggests that processing in one region may activate another region associated with the concurrent experience.",
    caution:
      "Useful as an explanatory model, but not the only account of synesthesia.",
  },
  {
    id: "structural-connectivity",
    title: "Structural Connectivity",
    shortTitle: "Connectivity",
    visualHint: "connectivity",
    description:
      "Some studies examine whether synesthetes show stronger or different connectivity between regions involved in perception, symbols, or binding.",
    caution:
      "Connectivity findings are part of the evidence, but they do not fully explain every form of synesthesia.",
  },
  {
    id: "projector-associator",
    title: "Projector / Associator",
    shortTitle: "Projector",
    visualHint: "projector",
    description:
      "Some synesthetes experience the concurrent as if it appears in external space. Others experience it internally, in the mind's eye.",
    caution:
      "These labels describe the quality or location of experience, not whether it is real or unreal.",
  },
  {
    id: "consistency",
    title: "Consistency Over Time",
    shortTitle: "Consistency",
    visualHint: "consistency",
    description:
      "Researchers often test whether a person gives stable associations across time, such as choosing a similar color for the same letter later.",
    caution:
      "This website interaction is educational. It is not a diagnostic test.",
  },
];

export const neuroscienceBrainNote =
  "Proposed regions and pathways. No single model fully explains every form of synesthesia.";

export const defaultBrainModeId = "letter-color";
export const defaultMechanismId = "cross-activation";
