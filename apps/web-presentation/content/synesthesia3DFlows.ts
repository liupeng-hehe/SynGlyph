export type SourceKey =
  | "mitOECS"
  | "ward2013"
  | "hupeDojat2015"
  | "nunn2002"
  | "rouwScholte2007"
  | "muggleton2007"
  | "zamm2013"
  | "tomson2013"
  | "priceMattingley2013"
  | "simnerHolenstein2007"
  | "smilek2007"
  | "wardSimner2003"
  | "jones2011"
  | "colizoli2013"
  | "beauchampRo2008"
  | "naumer2009"
  | "blakemore2005"
  | "banissyWard2007"
  | "mroczkoNikolic2014"
  | "humanConnectomeTractography";

export type EvidenceLevel =
  | "stronger"
  | "moderate"
  | "case-based"
  | "exploratory"
  | "visual-reference";

export type SourceNote = {
  key: SourceKey;
  index: number;
  shortLabel: string;
  fullCitation: string;
  usedFor: string;
};

export const sourceNotes: Record<SourceKey, SourceNote> = {
  mitOECS: {
    key: "mitOECS",
    index: 1,
    shortLabel: "MIT OECS",
    fullCitation:
      "MIT Open Encyclopedia of Cognitive Science — Synesthesia",
    usedFor:
      "Definition of inducer and concurrent; overview of grapheme-color, sequence-space, and lexical-gustatory synesthesia.",
  },
  ward2013: {
    key: "ward2013",
    index: 2,
    shortLabel: "Ward 2013",
    fullCitation:
      "Ward, J. (2013). Synesthesia. Annual Review of Psychology.",
    usedFor:
      "General review of synesthesia, including elicited nature, automaticity, prevalence, consistency, and phenomenology.",
  },
  hupeDojat2015: {
    key: "hupeDojat2015",
    index: 3,
    shortLabel: "Hupé & Dojat 2015",
    fullCitation:
      "Hupé, J.-M., & Dojat, M. (2015). A critical review of the neuroimaging literature on synesthesia. Frontiers in Human Neuroscience.",
    usedFor:
      "Cautionary framing: no single neuroimaging model should be presented as the definitive pathway for all synesthesia.",
  },
  nunn2002: {
    key: "nunn2002",
    index: 4,
    shortLabel: "Nunn et al. 2002",
    fullCitation:
      "Nunn, J. A., Gregory, L. J., Brammer, M., Williams, S. C. R., Parslow, D. M., Morgan, M. J., Morris, R. G., Bullmore, E. T., Baron-Cohen, S., & Gray, J. A. (2002). Functional magnetic resonance imaging of synesthesia: activation of V4/V8 by spoken words. Nature Neuroscience.",
    usedFor:
      "Color-area activation in synesthesia involving spoken-word induced color experiences.",
  },
  rouwScholte2007: {
    key: "rouwScholte2007",
    index: 5,
    shortLabel: "Rouw & Scholte 2007",
    fullCitation:
      "Rouw, R., & Scholte, H. S. (2007). Increased structural connectivity in grapheme-color synesthesia. Nature Neuroscience.",
    usedFor:
      "Structural connectivity differences in grapheme-color synesthesia.",
  },
  muggleton2007: {
    key: "muggleton2007",
    index: 6,
    shortLabel: "Muggleton et al. 2007",
    fullCitation:
      "Muggleton, N., Tsakanikos, E., Walsh, V., & Ward, J. (2007). Disruption of synaesthesia following TMS of the right posterior parietal cortex. Neuropsychologia.",
    usedFor:
      "Role of posterior parietal / parieto-occipital regions in grapheme-color synesthesia tasks.",
  },
  zamm2013: {
    key: "zamm2013",
    index: 7,
    shortLabel: "Zamm et al. 2013",
    fullCitation:
      "Zamm, A., Schlaug, G., Eagleman, D. M., & Loui, P. (2013). Pathways to seeing music: enhanced structural connectivity in colored-music synesthesia. NeuroImage.",
    usedFor:
      "White-matter connectivity in colored-music synesthesia.",
  },
  tomson2013: {
    key: "tomson2013",
    index: 8,
    shortLabel: "Tomson et al. 2013",
    fullCitation:
      "Tomson, S. N., Narayan, M., Allen, G. I., & Eagleman, D. M. (2013). Neural networks of colored sequence synesthesia. Journal of Neuroscience.",
    usedFor:
      "Network properties in colored sequence synesthesia involving overlearned sequences.",
  },
  priceMattingley2013: {
    key: "priceMattingley2013",
    index: 9,
    shortLabel: "Price & Mattingley 2013",
    fullCitation:
      "Price, M. C., & Mattingley, J. B. (2013). Automaticity in sequence-space synaesthesia: a critical appraisal of the evidence. Cortex.",
    usedFor:
      "Critical discussion of evidence for automaticity in sequence-space synesthesia.",
  },
  simnerHolenstein2007: {
    key: "simnerHolenstein2007",
    index: 10,
    shortLabel: "Simner & Holenstein 2007",
    fullCitation:
      "Simner, J., & Holenstein, E. (2007). Ordinal linguistic personification as a variant of synesthesia. Journal of Cognitive Neuroscience.",
    usedFor:
      "Ordinal linguistic personification as a subtype or variant of synesthesia.",
  },
  smilek2007: {
    key: "smilek2007",
    index: 11,
    shortLabel: "Smilek et al. 2007",
    fullCitation:
      "Smilek, D., Malcolmson, K. A., Carriere, J. S. A., Eller, M., Kwan, D., & Reynolds, M. (2007). When “3” is a Jerk and “E” is a King: personifying inanimate objects in synesthesia. Journal of Cognitive Neuroscience.",
    usedFor:
      "Case-based description of personifying letters, numbers, shapes, and objects.",
  },
  wardSimner2003: {
    key: "wardSimner2003",
    index: 12,
    shortLabel: "Ward & Simner 2003",
    fullCitation:
      "Ward, J., & Simner, J. (2003). Lexical-gustatory synaesthesia: linguistic and conceptual factors. Cognition.",
    usedFor:
      "Linguistic and conceptual factors in word- or speech-induced taste experiences.",
  },
  jones2011: {
    key: "jones2011",
    index: 13,
    shortLabel: "Jones et al. 2011",
    fullCitation:
      "Jones, C. L., Gray, M. A., Minati, L., Simner, J., Critchley, H. D., & Ward, J. (2011). The neural basis of illusory gustatory sensations: two rare cases of lexical-gustatory synaesthesia. Journal of Neuropsychology.",
    usedFor:
      "Functional neuroimaging of lexical-gustatory synesthesia.",
  },
  colizoli2013: {
    key: "colizoli2013",
    index: 14,
    shortLabel: "Colizoli et al. 2013",
    fullCitation:
      "Colizoli, O., Murre, J. M. J., & Rouw, R. (2013). A taste for words and sounds: a case of lexical-gustatory and sound-gustatory synesthesia. Frontiers in Psychology.",
    usedFor:
      "Lexical-gustatory and sound-gustatory case study; anterior insula and superior parietal involvement.",
  },
  beauchampRo2008: {
    key: "beauchampRo2008",
    index: 15,
    shortLabel: "Beauchamp & Ro 2008",
    fullCitation:
      "Beauchamp, M. S., & Ro, T. (2008). Neural substrates of sound-touch synesthesia after a thalamic lesion. Journal of Neuroscience.",
    usedFor:
      "Acquired auditory-tactile synesthesia and sound-induced somatosensory tingling.",
  },
  naumer2009: {
    key: "naumer2009",
    index: 16,
    shortLabel: "Naumer et al. 2009",
    fullCitation:
      "Naumer, M. J., & van den Bosch, J. J. F. (2009). Touching sounds: thalamocortical plasticity and the neural basis of multisensory integration. Journal of Neurophysiology.",
    usedFor:
      "Commentary on sound-touch synesthesia, thalamocortical plasticity, and multisensory integration.",
  },
  blakemore2005: {
    key: "blakemore2005",
    index: 17,
    shortLabel: "Blakemore et al. 2005",
    fullCitation:
      "Blakemore, S.-J., Bristow, D., Bird, G., Frith, C., & Ward, J. (2005). Somatosensory activations during the observation of touch and a case of vision-touch synaesthesia. Brain.",
    usedFor:
      "Vision-touch / mirror-touch case and somatosensory activation during observed touch.",
  },
  banissyWard2007: {
    key: "banissyWard2007",
    index: 18,
    shortLabel: "Banissy & Ward 2007",
    fullCitation:
      "Banissy, M. J., & Ward, J. (2007). Mirror-touch synesthesia is linked with empathy. Nature Neuroscience.",
    usedFor:
      "Evidence for mirror-touch synesthesia and its relationship with empathy.",
  },
  mroczkoNikolic2014: {
    key: "mroczkoNikolic2014",
    index: 19,
    shortLabel: "Mroczko-Wąsowicz & Nikolić 2014",
    fullCitation:
      "Mroczko-Wąsowicz, A., & Nikolić, D. (2014). Semantic mechanisms may be responsible for developing synesthesia. Frontiers in Human Neuroscience.",
    usedFor:
      "Conceptual and semantic mechanisms in synesthesia; useful for concept-shape and kinesthetic exploratory modes.",
  },
  humanConnectomeTractography: {
    key: "humanConnectomeTractography",
    index: 20,
    shortLabel: "HCP Tractography",
    fullCitation: "Human Connectome Project — Diffusion Tractography.",
    usedFor:
      "Visual reference for connectome-style neural pathways; not a synesthesia-specific pathway source.",
  },
};

export type BrainRegion3DId =
  | "visualCortexOccipital"
  | "ventralOccipitoTemporal"
  | "colorV4V8"
  | "auditorySuperiorTemporal"
  | "posteriorParietal"
  | "spatialParietal"
  | "semanticTemporal"
  | "anteriorInsulaGustatory"
  | "somatosensoryS1S2"
  | "mirrorTouchPremotorInsula"
  | "frontalAttention"
  | "motorBodyMapping"
  | "thalamus";

export type BrainRegion3D = {
  id: BrainRegion3DId;
  label: string;
  anatomicalHint: string;
  role: string;
  hemisphere: "left" | "right" | "bilateral" | "midline";
  color: string;
  meshNames: string[];
  displayPosition: [number, number, number];
};

export const brainRegions3D: Record<BrainRegion3DId, BrainRegion3D> = {
  visualCortexOccipital: {
    id: "visualCortexOccipital",
    label: "Visual input",
    anatomicalHint: "occipital visual cortex",
    role: "Receives visual information such as shape, contrast, and position.",
    hemisphere: "bilateral",
    color: "#B7C7FF",
    meshNames: ["visualCortex", "occipital", "occipitalCortex"],
    displayPosition: [0.55, -0.05, -0.15],
  },
  ventralOccipitoTemporal: {
    id: "ventralOccipitoTemporal",
    label: "Grapheme recognition",
    anatomicalHint: "ventral occipito-temporal region",
    role: "Recognizes letters, numbers, and written symbols as meaningful visual forms.",
    hemisphere: "left",
    color: "#FFB6B6",
    meshNames: ["ventralOccipitoTemporal", "fusiform", "VWFA", "graphemeRecognition"],
    displayPosition: [0.26, -0.36, -0.18],
  },
  colorV4V8: {
    id: "colorV4V8",
    label: "Color processing",
    anatomicalHint: "ventral visual cortex / V4-V8",
    role: "Supports color experience and color-like visual qualities.",
    hemisphere: "left",
    color: "#00B8D9",
    meshNames: ["V4", "V8", "colorArea", "ventralVisualColor"],
    displayPosition: [0.48, -0.3, -0.2],
  },
  auditorySuperiorTemporal: {
    id: "auditorySuperiorTemporal",
    label: "Auditory processing",
    anatomicalHint: "superior temporal region",
    role: "Processes sound, voice, pitch, timbre, and music.",
    hemisphere: "bilateral",
    color: "#C9B7FF",
    meshNames: ["auditoryCortex", "superiorTemporal", "STG"],
    displayPosition: [-0.08, -0.34, -0.03],
  },
  posteriorParietal: {
    id: "posteriorParietal",
    label: "Binding / integration",
    anatomicalHint: "posterior parietal cortex / parieto-occipital region",
    role: "Possible integration region for attention, feature binding, and multisensory links.",
    hemisphere: "right",
    color: "#FFD447",
    meshNames: ["posteriorParietal", "parietoOccipital", "IPS", "angularGyrus"],
    displayPosition: [0.1, 0.3, 0.06],
  },
  spatialParietal: {
    id: "spatialParietal",
    label: "Spatial mapping",
    anatomicalHint: "parietal spatial representation",
    role: "Supports mental maps, spatial layouts, sequence-space structures, and spatial attention.",
    hemisphere: "bilateral",
    color: "#2ECC71",
    meshNames: ["spatialParietal", "intraparietalSulcus", "IPS"],
    displayPosition: [0.22, 0.24, 0.14],
  },
  semanticTemporal: {
    id: "semanticTemporal",
    label: "Language / meaning",
    anatomicalHint: "semantic language network",
    role: "Processes words, names, meanings, concepts, and associations.",
    hemisphere: "left",
    color: "#FF9F1C",
    meshNames: ["semanticTemporal", "middleTemporal", "temporalPole", "languageSemantic"],
    displayPosition: [-0.3, -0.2, -0.04],
  },
  anteriorInsulaGustatory: {
    id: "anteriorInsulaGustatory",
    label: "Taste / visceral sensation",
    anatomicalHint: "anterior insula / gustatory-related region",
    role: "Associated with taste-like, visceral, and bodily sensation.",
    hemisphere: "left",
    color: "#FF8A3D",
    meshNames: ["anteriorInsula", "insula", "gustatoryInsula"],
    displayPosition: [-0.03, -0.1, -0.04],
  },
  somatosensoryS1S2: {
    id: "somatosensoryS1S2",
    label: "Body touch map",
    anatomicalHint: "primary / secondary somatosensory cortex",
    role: "Supports touch, pressure, vibration, pain, and body-location sensations.",
    hemisphere: "bilateral",
    color: "#7B61FF",
    meshNames: ["somatosensory", "S1", "S2", "postcentralGyrus"],
    displayPosition: [0.02, 0.34, 0.18],
  },
  mirrorTouchPremotorInsula: {
    id: "mirrorTouchPremotorInsula",
    label: "Observed touch mapping",
    anatomicalHint: "premotor / insula / somatosensory observation network",
    role: "May support mapping observed touch onto one's own body representation.",
    hemisphere: "bilateral",
    color: "#FF4FD8",
    meshNames: ["premotor", "inferiorFrontal", "mirrorTouch", "insula"],
    displayPosition: [-0.2, 0.1, 0.2],
  },
  frontalAttention: {
    id: "frontalAttention",
    label: "Attention / modulation",
    anatomicalHint: "frontal attention network",
    role: "May modulate attention, interpretation, and access to the concurrent.",
    hemisphere: "bilateral",
    color: "#FFDFA3",
    meshNames: ["frontalAttention", "DLPFC", "frontalEyeFields"],
    displayPosition: [-0.48, 0.17, 0.17],
  },
  motorBodyMapping: {
    id: "motorBodyMapping",
    label: "Motor / body mapping",
    anatomicalHint: "motor and body representation networks",
    role: "May support movement, bodily visualization, gesture-like structure, or body-based spatial reasoning.",
    hemisphere: "bilateral",
    color: "#A6E37D",
    meshNames: ["motorCortex", "precentralGyrus", "bodyMapping"],
    displayPosition: [-0.08, 0.42, 0.2],
  },
  thalamus: {
    id: "thalamus",
    label: "Thalamic relay",
    anatomicalHint: "thalamus",
    role: "A possible relay involved in some acquired sound-touch cases and multisensory routing.",
    hemisphere: "midline",
    color: "#86D9FF",
    meshNames: ["thalamus"],
    displayPosition: [0.02, -0.05, -0.04],
  },
};

export type Synesthesia3DFlow = {
  id: string;
  label: string;
  shortLabel: string;
  category: "color" | "sequence" | "taste" | "touch" | "rare";
  inputName: string;
  inputExamples: string[];
  inputDescription: string;
  activeRegionIds: BrainRegion3DId[];
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
  pathwaySummary: string;
  caution: string;
  evidenceLevel: EvidenceLevel;
  sourceKeys: SourceKey[];
};

export const synesthesia3DFlows: Synesthesia3DFlow[] = [
  {
    id: "grapheme-color",
    category: "color",
    label: "Grapheme-Color Synesthesia",
    shortLabel: "Grapheme → Color",
    inputName: "Letters or numbers",
    inputExamples: ["A", "5", "M", "7"],
    inputDescription:
      "Letters, numbers, or written symbols act as the inducer.",
    activeRegionIds: [
      "visualCortexOccipital",
      "ventralOccipitoTemporal",
      "posteriorParietal",
      "colorV4V8",
    ],
    outputName: "Stable color concurrent",
    outputExamples: ["A may feel red", "5 may feel green", "7 may feel blue"],
    outputDescription:
      "A grapheme may evoke a color-like experience that can remain stable for the same person over time.",
    outputIcon: "colorSwatches",
    pathwaySummary:
      "A visual symbol may be recognized as a grapheme while possible binding and color-processing regions become involved.",
    caution:
      "The displayed colors are examples only. Each synesthete may have a different personal mapping.",
    evidenceLevel: "stronger",
    sourceKeys: [
      "mitOECS",
      "nunn2002",
      "rouwScholte2007",
      "muggleton2007",
      "hupeDojat2015",
    ],
  },
  {
    id: "chromesthesia",
    category: "color",
    label: "Chromesthesia",
    shortLabel: "Sound → Color",
    inputName: "Sound, music, voice, or pitch",
    inputExamples: ["violin note", "piano chord", "voice", "bass vibration"],
    inputDescription: "Auditory input acts as the inducer.",
    activeRegionIds: [
      "auditorySuperiorTemporal",
      "posteriorParietal",
      "colorV4V8",
    ],
    outputName: "Color, shape, or moving image",
    outputExamples: ["yellow flash", "blue mist", "moving ribbon", "sharp shape"],
    outputDescription:
      "Sound may evoke color, shape, motion, or visual atmosphere.",
    outputIcon: "soundColor",
    pathwaySummary:
      "Auditory processing may be linked to visual-color or visual-form concurrents through possible cross-modal pathways.",
    caution:
      "Sound-color experiences vary widely and are not the same for every person.",
    evidenceLevel: "moderate",
    sourceKeys: ["zamm2013", "nunn2002", "ward2013", "hupeDojat2015"],
  },
  {
    id: "spatial-sequence",
    category: "sequence",
    label: "Spatial Sequence Synesthesia",
    shortLabel: "Sequence → Space",
    inputName: "Time, numbers, months, or weekdays",
    inputExamples: ["Monday", "April", "2026", "number line"],
    inputDescription: "Abstract sequences act as the inducer.",
    activeRegionIds: [
      "semanticTemporal",
      "posteriorParietal",
      "spatialParietal",
    ],
    outputName: "Mental spatial layout",
    outputExamples: ["calendar loop", "3D number line", "months around the body"],
    outputDescription:
      "Sequences may appear in a specific mental space, direction, loop, or shape.",
    outputIcon: "calendarMap",
    pathwaySummary:
      "A conceptual sequence may be associated with spatial mapping and parietal representation.",
    caution:
      "The spatial form is usually personal and should not be treated as a universal calendar map.",
    evidenceLevel: "moderate",
    sourceKeys: [
      "mitOECS",
      "priceMattingley2013",
      "tomson2013",
      "ward2013",
      "hupeDojat2015",
    ],
  },
  {
    id: "ordinal-personification",
    category: "sequence",
    label: "Ordinal Linguistic Personification",
    shortLabel: "Symbols → Personality",
    inputName: "Letters, numbers, dates, or ordered symbols",
    inputExamples: ["4", "9", "Tuesday", "B"],
    inputDescription:
      "Ordered linguistic or symbolic units act as the inducer.",
    activeRegionIds: [
      "ventralOccipitoTemporal",
      "semanticTemporal",
      "frontalAttention",
    ],
    outputName: "Personality or temperament",
    outputExamples: ["4 feels stern", "9 feels elegant", "Tuesday feels young"],
    outputDescription:
      "An abstract symbol may seem to have personality, social quality, or emotional character.",
    outputIcon: "symbolPersonality",
    pathwaySummary:
      "Symbol recognition may be linked to semantic and social-personality associations.",
    caution:
      "This type is supported as a synesthetic variant, but its precise neural pathway is more exploratory.",
    evidenceLevel: "exploratory",
    sourceKeys: [
      "simnerHolenstein2007",
      "smilek2007",
      "ward2013",
      "hupeDojat2015",
    ],
  },
  {
    id: "lexical-gustatory",
    category: "taste",
    label: "Lexical-Gustatory Synesthesia",
    shortLabel: "Word → Taste",
    inputName: "Words, names, or speech sounds",
    inputExamples: ["Monday", "love", "window", "a person's name"],
    inputDescription: "Reading or hearing a word acts as the inducer.",
    activeRegionIds: [
      "semanticTemporal",
      "anteriorInsulaGustatory",
      "posteriorParietal",
    ],
    outputName: "Taste-like concurrent",
    outputExamples: ["salt", "strawberry", "metallic taste", "warm milk"],
    outputDescription:
      "A word or name may evoke a taste-like sensation or strong gustatory impression.",
    outputIcon: "tasteObjects",
    pathwaySummary:
      "Language and meaning may be linked to gustatory or visceral sensation, with possible parietal involvement in binding.",
    caution:
      "This type is relatively rare and much of the neural evidence is case-based.",
    evidenceLevel: "case-based",
    sourceKeys: [
      "wardSimner2003",
      "jones2011",
      "colizoli2013",
      "mitOECS",
      "hupeDojat2015",
    ],
  },
  {
    id: "auditory-tactile",
    category: "touch",
    label: "Auditory-Tactile Synesthesia",
    shortLabel: "Sound → Touch",
    inputName: "Specific sounds",
    inputExamples: ["low bass", "scratching sound", "bell", "whisper"],
    inputDescription: "Sound acts as the inducer.",
    activeRegionIds: [
      "auditorySuperiorTemporal",
      "thalamus",
      "somatosensoryS1S2",
      "posteriorParietal",
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
    pathwaySummary:
      "Auditory processing may be linked to somatosensory body maps, with thalamocortical routing relevant in acquired sound-touch cases.",
    caution:
      "Evidence is strong for particular case studies, but should not be generalized to every developmental synesthesia type.",
    evidenceLevel: "case-based",
    sourceKeys: ["beauchampRo2008", "naumer2009", "ward2013", "hupeDojat2015"],
  },
  {
    id: "mirror-touch",
    category: "touch",
    label: "Mirror-Touch Synesthesia",
    shortLabel: "Observed Touch → Felt Touch",
    inputName: "Seeing another person being touched",
    inputExamples: ["someone's arm touched", "a face being tapped", "visible injury"],
    inputDescription: "Observed touch acts as the inducer.",
    activeRegionIds: [
      "visualCortexOccipital",
      "mirrorTouchPremotorInsula",
      "somatosensoryS1S2",
      "posteriorParietal",
    ],
    outputName: "Felt touch on one's own body",
    outputExamples: ["same-side touch", "mirrored touch", "pressure"],
    outputDescription:
      "Seeing touch on another person may evoke a corresponding sensation on one's own body.",
    outputIcon: "mirrorBodies",
    pathwaySummary:
      "Observed body information may be mapped onto one's own somatosensory representation.",
    caution: "Present this carefully and do not dramatize pain or injury.",
    evidenceLevel: "case-based",
    sourceKeys: [
      "blakemore2005",
      "banissyWard2007",
      "ward2013",
      "hupeDojat2015",
    ],
  },
  {
    id: "concept-shape",
    category: "rare",
    label: "Concept-Shape Synesthesia",
    shortLabel: "Concept → Shape",
    inputName: "Abstract concepts, emotion, or ideas",
    inputExamples: ["justice", "anxiety", "memory", "a mathematical idea"],
    inputDescription: "An abstract concept acts as the inducer.",
    activeRegionIds: [
      "semanticTemporal",
      "posteriorParietal",
      "spatialParietal",
    ],
    outputName: "Geometric form or spatial structure",
    outputExamples: ["triangle", "spiral", "dense cube", "thin line"],
    outputDescription:
      "Concepts may appear with a geometric structure, contour, volume, or spatial quality.",
    outputIcon: "conceptShapes",
    pathwaySummary:
      "Semantic or conceptual processing may be linked to spatial or geometric representation.",
    caution:
      "This is exploratory and should be shown as conceptual, not as a fixed anatomical pathway.",
    evidenceLevel: "exploratory",
    sourceKeys: ["mroczkoNikolic2014", "ward2013", "hupeDojat2015"],
  },
  {
    id: "kinesthetic",
    category: "rare",
    label: "Kinesthetic Synesthesia",
    shortLabel: "System → Body",
    inputName: "Complex systems, equations, or structural reasoning",
    inputExamples: ["equation", "complex system", "logic structure"],
    inputDescription: "Analyzing a system or structure acts as the inducer.",
    activeRegionIds: [
      "semanticTemporal",
      "posteriorParietal",
      "spatialParietal",
      "motorBodyMapping",
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
    pathwaySummary:
      "Abstract structure may be linked to body mapping and spatial reasoning.",
    caution:
      "This is rare and difficult to generalize. Keep the visualization exploratory rather than definitive.",
    evidenceLevel: "exploratory",
    sourceKeys: ["mroczkoNikolic2014", "ward2013", "hupeDojat2015"],
  },
];

export const default3DFlowId = "grapheme-color";

export const globalNeuroDisclaimer =
  "Simplified educational visualization. Proposed regions and pathways vary by person and by synesthesia type. This is not a diagnostic tool, anatomical atlas, or measured brain scan.";

export const modelEducationNote =
  "This 3D visualization is a simplified educational model. It translates findings from synesthesia research into possible brain-region highlights. The highlighted regions are not a diagnostic map, not a measured scan, and not a universal pathway shared by all synesthetes.";

export const tractographyNote =
  "The visual style is inspired by diffusion tractography and connectome maps. The highlighted routes are educational approximations, not measured fiber tracts from an individual brain.";

export const BRAIN_GLB_PATH = "/neuro/brain_surface.glb";
export const SEGMENTED_BRAIN_GLB_PATH = "/neuro/segmented_brain.glb";

/** Maps logical region IDs to possible mesh / material names in segmented_brain.glb */
export const brainMeshAliases: Record<BrainRegion3DId, string[]> = {
  visualCortexOccipital: [
    "visualCortexOccipital",
    "visualCortex",
    "occipital",
    "occipitalLobe",
    "BA17",
    "BA18",
    "BA19",
  ],
  ventralOccipitoTemporal: [
    "ventralOccipitoTemporal",
    "fusiform",
    "VWFA",
    "BA37",
    "fusiformGyrus",
  ],
  colorV4V8: ["colorV4V8", "V4", "V8", "colorArea", "ventralVisualColor"],
  auditorySuperiorTemporal: [
    "auditorySuperiorTemporal",
    "auditoryCortex",
    "superiorTemporal",
    "STG",
    "BA41",
    "BA42",
    "Heschl",
  ],
  posteriorParietal: [
    "posteriorParietal",
    "parietal",
    "IPS",
    "BA7",
    "BA39",
    "BA40",
    "angularGyrus",
  ],
  spatialParietal: [
    "spatialParietal",
    "intraparietalSulcus",
    "IPS",
    "BA7",
    "superiorParietal",
  ],
  semanticTemporal: [
    "semanticTemporal",
    "middleTemporal",
    "temporalPole",
    "BA21",
    "BA22",
    "BA38",
    "MTG",
    "temporalPole",
  ],
  anteriorInsulaGustatory: [
    "anteriorInsulaGustatory",
    "anteriorInsula",
    "insula",
    "gustatoryInsula",
    "insulaAnterior",
  ],
  somatosensoryS1S2: [
    "somatosensoryS1S2",
    "somatosensory",
    "S1",
    "S2",
    "postcentralGyrus",
    "BA1",
    "BA2",
    "BA3",
  ],
  thalamus: ["thalamus", "thalamic"],
  mirrorTouchPremotorInsula: [
    "mirrorTouchPremotorInsula",
    "mirrorTouch",
    "premotor",
    "insula",
    "IFG",
    "BA44",
    "BA45",
  ],
  motorBodyMapping: [
    "motorBodyMapping",
    "motorCortex",
    "precentralGyrus",
    "M1",
    "BA4",
    "BA6",
  ],
  frontalAttention: [
    "frontalAttention",
    "DLPFC",
    "frontalEyeFields",
    "BA9",
    "BA46",
    "prefrontal",
    "frontal",
  ],
};

export const atlasEducationDisclaimer =
  "This is a simplified educational model. Highlighted regions indicate possible involvement discussed in the literature. They are not a diagnostic map, measured scan, or universal pathway shared by all synesthetes.";

export const evidenceLevelLabels: Record<EvidenceLevel, string> = {
  stronger: "Stronger evidence",
  moderate: "Moderate evidence",
  "case-based": "Case-based evidence",
  exploratory: "Exploratory",
  "visual-reference": "Visual reference",
};
