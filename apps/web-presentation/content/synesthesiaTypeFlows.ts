export type SynesthesiaCategory =
  | "color"
  | "sequence"
  | "taste"
  | "touch"
  | "rare";

export type NeuralClusterId =
  | "visualInput"
  | "graphemeRecognition"
  | "colorProcessing"
  | "auditoryProcessing"
  | "parietalBinding"
  | "spatialMapping"
  | "semanticLanguage"
  | "gustatoryInsula"
  | "somatosensoryMap"
  | "mirrorTouchNetwork"
  | "conceptualAssociation"
  | "motorBodyMapping"
  | "attentionModulation";

export type NeuralCluster = {
  id: NeuralClusterId;
  label: string;
  anatomicalHint: string;
  role: string;
  color: string;
  x: number;
  y: number;
};

export type SynesthesiaFlow = {
  id: string;
  category: SynesthesiaCategory;
  label: string;
  shortLabel: string;
  inputName: string;
  inputExamples: string[];
  inputDescription: string;
  activeClusters: NeuralClusterId[];
  outputName: string;
  outputExamples: string[];
  outputDescription: string;
  outputIcon:
    | "colorSwatches"
    | "soundColor"
    | "calendarMap"
    | "symbolPersonality"
    | "tasteObjects"
    | "soundTouch"
    | "mirrorBodies"
    | "conceptShapes"
    | "bodyMotion";
  summary: string;
  caution: string;
};

export const neuralClusters: NeuralCluster[] = [
  {
    id: "visualInput",
    label: "Visual input",
    anatomicalHint: "occipital visual cortex",
    role: "Receives visual information such as shape, contrast, and position.",
    color: "#B7C7FF",
    x: 620,
    y: 285,
  },
  {
    id: "graphemeRecognition",
    label: "Grapheme recognition",
    anatomicalHint: "ventral occipito-temporal region",
    role: "Recognizes letters, numbers, and written symbols as meaningful forms.",
    color: "#FFB6B6",
    x: 500,
    y: 340,
  },
  {
    id: "colorProcessing",
    label: "Color processing",
    anatomicalHint: "ventral visual cortex / V4",
    role: "Supports color experience and color-like visual qualities.",
    color: "#00B8D9",
    x: 640,
    y: 350,
  },
  {
    id: "auditoryProcessing",
    label: "Auditory processing",
    anatomicalHint: "superior temporal region",
    role: "Processes sound, voice, pitch, timbre, and music.",
    color: "#C9B7FF",
    x: 400,
    y: 350,
  },
  {
    id: "parietalBinding",
    label: "Binding / integration",
    anatomicalHint: "parietal cortex",
    role: "A possible hub for attention, feature binding, and multisensory integration.",
    color: "#FFD447",
    x: 455,
    y: 160,
  },
  {
    id: "spatialMapping",
    label: "Spatial mapping",
    anatomicalHint: "parietal spatial representation",
    role: "Supports mental maps, spatial layouts, and sequence-space arrangements.",
    color: "#2ECC71",
    x: 555,
    y: 135,
  },
  {
    id: "semanticLanguage",
    label: "Language / meaning",
    anatomicalHint: "semantic language network",
    role: "Processes words, names, concepts, and meanings.",
    color: "#FF9F1C",
    x: 300,
    y: 330,
  },
  {
    id: "gustatoryInsula",
    label: "Taste / visceral sensation",
    anatomicalHint: "insula / gustatory-related region",
    role: "Associated with taste-like and bodily sensation.",
    color: "#FF8A3D",
    x: 365,
    y: 255,
  },
  {
    id: "somatosensoryMap",
    label: "Body touch map",
    anatomicalHint: "somatosensory cortex",
    role: "Supports touch, pressure, vibration, pain, and body-location sensations.",
    color: "#7B61FF",
    x: 390,
    y: 165,
  },
  {
    id: "mirrorTouchNetwork",
    label: "Observed touch mapping",
    anatomicalHint: "social perception / somatosensory network",
    role: "May map observed touch onto one's own body representation.",
    color: "#FF4FD8",
    x: 490,
    y: 210,
  },
  {
    id: "conceptualAssociation",
    label: "Conceptual association",
    anatomicalHint: "distributed conceptual network",
    role: "Links abstract ideas, memory, emotion, shape, and atmosphere.",
    color: "#86D9FF",
    x: 270,
    y: 195,
  },
  {
    id: "motorBodyMapping",
    label: "Motor / body mapping",
    anatomicalHint: "motor and body representation networks",
    role: "Can support movement, bodily visualization, or spatialized system understanding.",
    color: "#A6E37D",
    x: 230,
    y: 155,
  },
  {
    id: "attentionModulation",
    label: "Attention / modulation",
    anatomicalHint: "frontal attention network",
    role: "May modulate attention, interpretation, and access to the concurrent.",
    color: "#FFDFA3",
    x: 170,
    y: 230,
  },
];

export const synesthesiaFlows: SynesthesiaFlow[] = [
  {
    id: "grapheme-color",
    category: "color",
    label: "Grapheme-Color Synesthesia",
    shortLabel: "Grapheme → Color",
    inputName: "Letters or numbers",
    inputExamples: ["A", "5", "M", "7"],
    inputDescription: "Letters, numbers, or written symbols act as the inducer.",
    activeClusters: [
      "visualInput",
      "graphemeRecognition",
      "parietalBinding",
      "colorProcessing",
    ],
    outputName: "Stable color concurrent",
    outputExamples: ["A may feel red", "5 may feel green", "7 may feel blue"],
    outputDescription:
      "A grapheme may evoke a color-like experience that can remain stable for the same person over time.",
    outputIcon: "colorSwatches",
    summary:
      "A written symbol may be processed as a visual form while also evoking a color-like concurrent.",
    caution:
      "The displayed colors are examples only. Each synesthete may have a different personal mapping.",
  },
  {
    id: "chromesthesia",
    category: "color",
    label: "Chromesthesia",
    shortLabel: "Sound → Color",
    inputName: "Sound, music, voice, or pitch",
    inputExamples: ["violin note", "piano chord", "voice", "bass vibration"],
    inputDescription: "Auditory input acts as the inducer.",
    activeClusters: ["auditoryProcessing", "parietalBinding", "colorProcessing"],
    outputName: "Color, shape, or moving image",
    outputExamples: ["yellow flash", "blue mist", "moving ribbon", "sharp shape"],
    outputDescription:
      "Sound may evoke color, shape, motion, or visual atmosphere.",
    outputIcon: "soundColor",
    summary:
      "Auditory processing may be linked to a color or motion-like concurrent.",
    caution:
      "Sound-color experiences vary widely and are not the same for every person.",
  },
  {
    id: "spatial-sequence",
    category: "sequence",
    label: "Spatial Sequence Synesthesia",
    shortLabel: "Sequence → Space",
    inputName: "Time, numbers, months, or weekdays",
    inputExamples: ["Monday", "April", "2026", "number line"],
    inputDescription: "Abstract sequences act as the inducer.",
    activeClusters: ["semanticLanguage", "parietalBinding", "spatialMapping"],
    outputName: "Mental spatial layout",
    outputExamples: ["calendar loop", "3D number line", "months around the body"],
    outputDescription:
      "Sequences may appear in a specific mental space, direction, loop, or shape.",
    outputIcon: "calendarMap",
    summary:
      "Conceptual sequence processing may be linked to spatial mapping.",
    caution:
      "The spatial form is usually personal and should not be treated as a universal calendar map.",
  },
  {
    id: "ordinal-personification",
    category: "sequence",
    label: "Ordinal Linguistic Personification",
    shortLabel: "Symbols → Personality",
    inputName: "Letters, numbers, dates, or ordered symbols",
    inputExamples: ["4", "9", "Tuesday", "B"],
    inputDescription: "Ordered linguistic or symbolic units act as the inducer.",
    activeClusters: [
      "graphemeRecognition",
      "semanticLanguage",
      "conceptualAssociation",
      "attentionModulation",
    ],
    outputName: "Personality or temperament",
    outputExamples: ["4 feels stern", "9 feels elegant", "Tuesday feels young"],
    outputDescription:
      "An abstract symbol may seem to have personality, social quality, or emotional character.",
    outputIcon: "symbolPersonality",
    summary:
      "Symbolic recognition may be linked to conceptual and social-emotional associations.",
    caution:
      "These qualities are subjective associations, not objective properties.",
  },
  {
    id: "lexical-gustatory",
    category: "taste",
    label: "Lexical-Gustatory Synesthesia",
    shortLabel: "Word → Taste",
    inputName: "Words, names, or speech sounds",
    inputExamples: ["Monday", "love", "window", "a person's name"],
    inputDescription: "Reading or hearing a word acts as the inducer.",
    activeClusters: [
      "semanticLanguage",
      "conceptualAssociation",
      "gustatoryInsula",
      "parietalBinding",
    ],
    outputName: "Taste-like concurrent",
    outputExamples: ["salt", "strawberry", "metallic taste", "warm milk"],
    outputDescription:
      "A word or name may evoke a taste-like sensation or strong gustatory impression.",
    outputIcon: "tasteObjects",
    summary:
      "Language meaning may be linked to taste-like bodily sensation.",
    caution:
      "This type is relatively rare. The taste examples are illustrative, not universal.",
  },
  {
    id: "auditory-tactile",
    category: "touch",
    label: "Auditory-Tactile Synesthesia",
    shortLabel: "Sound → Touch",
    inputName: "Specific sounds",
    inputExamples: ["low bass", "scratching sound", "bell", "whisper"],
    inputDescription: "Sound acts as the inducer.",
    activeClusters: [
      "auditoryProcessing",
      "parietalBinding",
      "somatosensoryMap",
    ],
    outputName: "Touch or body sensation",
    outputExamples: [
      "vibration on shoulders",
      "pressure",
      "tingling",
      "cold sensation",
    ],
    outputDescription:
      "A sound may evoke a tactile sensation on or inside the body.",
    outputIcon: "soundTouch",
    summary: "Auditory processing may be linked to the body touch map.",
    caution:
      "Body location and intensity can differ greatly from person to person.",
  },
  {
    id: "mirror-touch",
    category: "touch",
    label: "Mirror-Touch Synesthesia",
    shortLabel: "Observed Touch → Felt Touch",
    inputName: "Seeing another person being touched",
    inputExamples: ["someone's arm touched", "a face being tapped", "visible injury"],
    inputDescription: "Observed touch or pain acts as the inducer.",
    activeClusters: [
      "visualInput",
      "mirrorTouchNetwork",
      "somatosensoryMap",
      "parietalBinding",
    ],
    outputName: "Felt touch on one's own body",
    outputExamples: ["same-side touch", "mirrored touch", "pressure"],
    outputDescription:
      "Seeing touch on another person may evoke a corresponding sensation on one's own body.",
    outputIcon: "mirrorBodies",
    summary:
      "Observed body information may be mapped onto one's own somatosensory representation.",
    caution:
      "This can be intense for some people. Present it carefully and do not dramatize pain.",
  },
  {
    id: "concept-shape",
    category: "rare",
    label: "Concept-Shape Synesthesia",
    shortLabel: "Concept → Shape",
    inputName: "Abstract concepts, emotion, or ideas",
    inputExamples: ["justice", "anxiety", "memory", "a mathematical idea"],
    inputDescription: "An abstract concept acts as the inducer.",
    activeClusters: [
      "semanticLanguage",
      "conceptualAssociation",
      "parietalBinding",
      "spatialMapping",
    ],
    outputName: "Geometric form or spatial structure",
    outputExamples: ["triangle", "spiral", "dense cube", "thin line"],
    outputDescription:
      "Concepts may appear with a geometric structure, contour, volume, or spatial quality.",
    outputIcon: "conceptShapes",
    summary: "Meaning and association may become spatial or geometric.",
    caution:
      "This is a simplified representation of a rare and highly personal type.",
  },
  {
    id: "kinesthetic",
    category: "rare",
    label: "Kinesthetic Synesthesia",
    shortLabel: "System → Body Motion",
    inputName: "Complex systems, equations, or structural reasoning",
    inputExamples: ["equation", "complex system", "logic structure"],
    inputDescription: "Analyzing a system or structure acts as the inducer.",
    activeClusters: [
      "conceptualAssociation",
      "parietalBinding",
      "motorBodyMapping",
      "spatialMapping",
    ],
    outputName: "Body-based spatial or movement sensation",
    outputExamples: [
      "movement in hands",
      "spatial pull",
      "body map",
      "gesture-like structure",
    ],
    outputDescription:
      "A complex idea may be felt as bodily movement, pressure, gesture, or spatialized structure.",
    outputIcon: "bodyMotion",
    summary:
      "Abstract structure may be linked to body mapping and spatial reasoning.",
    caution:
      "This is rare and difficult to generalize. Keep the visualization exploratory rather than definitive.",
  },
];

export const defaultFlowId = "grapheme-color";

export const synesthesiaNeuroDisclaimer =
  "Simplified educational visualization. Proposed pathways vary by person and by synesthesia type. This is not a diagnostic or anatomical atlas.";

export const BRAIN_SILHOUETTE_PATH =
  "M90 305 C70 230 105 155 180 105 C250 58 330 55 392 82 C452 42 560 60 650 128 C735 194 780 292 745 384 C708 480 600 525 488 505 C425 493 392 462 365 438 C320 482 226 480 165 420 C116 372 96 340 90 305 Z";

export const INPUT_ANCHOR = { x: 95, y: 295 };
