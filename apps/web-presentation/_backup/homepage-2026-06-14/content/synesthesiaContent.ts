export type SourceKey =
  | "mitSynesthesia"
  | "clevelandSynesthesia"
  | "simner2006"
  | "synesthesiaBattery"
  | "ramachandranHubbard2001"
  | "rouwScholte2007"
  | "baudelaireCorrespondances"
  | "britannicaVoyelles"
  | "lenbachhausKandinsky"
  | "scriabinPrometheus"
  | "kupkaAmorpha"
  | "okeeffeMusicPinkBlue"
  | "macdonaldWrightSynchromy"
  | "rimingtonColorOrgan"
  | "hupeDojat2015";

export type InteractionType =
  | "colorWords"
  | "senseBridge"
  | "inducerConcurrent"
  | "neuralDiagram"
  | "exhibitWall"
  | "personalTransition";

export type Chapter = {
  id: string;
  eyebrow: string;
  navLabel: string;
  title: string;
  subtitle?: string;
  body: string[];
  interaction?: {
    type: InteractionType;
    words?: string[];
  };
  sourceKeys?: SourceKey[];
};

export const sourceNotes: Record<
  SourceKey,
  {
    label: string;
    url: string;
    note: string;
  }
> = {
  mitSynesthesia: {
    label: "MIT Open Encyclopedia of Cognitive Science — Synesthesia",
    url: "https://oecs.mit.edu/pub/rma3jjdk",
    note: "Definition of synesthesia, inducer and concurrent, automaticity, idiosyncrasy, and neuroscience caveats.",
  },
  clevelandSynesthesia: {
    label: "Cleveland Clinic — Synesthesia",
    url: "https://my.clevelandclinic.org/health/symptoms/24995-synesthesia",
    note: "Accessible medical framing; synesthesia is usually not a disease or medical condition.",
  },
  simner2006: {
    label:
      "Simner et al. 2006 — Synaesthesia: The Prevalence of Atypical Cross-Modal Experiences",
    url: "https://www.research.ed.ac.uk/en/publications/synaesthesia-the-prevalence-of-atypical-cross-modal-experiences/",
    note: "Prevalence study using non-self-referred samples and objective testing.",
  },
  synesthesiaBattery: {
    label: "The Synesthesia Battery",
    url: "https://synesthete.ircn.jp/",
    note: "Standardized tests, questionnaires, and scoring tools for synesthesia research.",
  },
  ramachandranHubbard2001: {
    label: "Ramachandran & Hubbard 2001",
    url: "https://pubmed.ncbi.nlm.nih.gov/11370973/",
    note: "Influential cross-activation model for grapheme-color synesthesia.",
  },
  rouwScholte2007: {
    label: "Rouw & Scholte 2007",
    url: "https://pubmed.ncbi.nlm.nih.gov/17515901/",
    note: "DTI study discussing increased structural connectivity in grapheme-color synesthesia.",
  },
  baudelaireCorrespondances: {
    label: "Charles Baudelaire — Correspondances",
    url: "https://fleursdumal.org/poem/103",
    note: "A literary example of scents, colors, and sounds corresponding.",
  },
  britannicaVoyelles: {
    label: "Encyclopaedia Britannica — Voyelles",
    url: "https://www.britannica.com/topic/Voyelles",
    note: "Reference for Rimbaud's vowel-color poem.",
  },
  lenbachhausKandinsky: {
    label: "Lenbachhaus — Wassily Kandinsky, Impression III (Concert)",
    url: "https://www.lenbachhaus.de/en/digital/collection-online/detail/impression-iii-konzert-30012206",
    note: "Official museum reference for Kandinsky's 1911 painting based on acoustic experience.",
  },
  scriabinPrometheus: {
    label: "Alexander Scriabin — Prometheus: The Poem of Fire",
    url: "https://en.wikipedia.org/wiki/Prometheus:_The_Poem_of_Fire",
    note: "General reference for Scriabin's color-music system. Use as an optional exhibit and avoid diagnostic claims.",
  },
  kupkaAmorpha: {
    label: "Cleveland Museum of Art — Amorpha: Fugue in Two Colors II",
    url: "https://www.clevelandart.org/art/1969.51",
    note: "Kupka translated Bach and motion into abstract color forms.",
  },
  okeeffeMusicPinkBlue: {
    label: "Whitney Museum — Music, Pink and Blue No. 2",
    url: "https://whitney.org/collection/works/7759",
    note: "O'Keeffe linked music, feeling, and abstract color.",
  },
  macdonaldWrightSynchromy: {
    label: "Brooklyn Museum — Synchromy No. 3",
    url: "https://www.brooklynmuseum.org/objects/2094",
    note: "Synchromism treated color as rhythmic harmony.",
  },
  rimingtonColorOrgan: {
    label: "Rimington — Colour-Music: The Art of Mobile Colour (1912)",
    url: "https://commons.wikimedia.org/wiki/File:Rimington%27s_Colour-Organ_2.jpg",
    note: "Early colour organ that projected light with music.",
  },
  hupeDojat2015: {
    label:
      "Hupé & Dojat 2015 — A critical review of the neuroimaging literature on synesthesia",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4379872/",
    note: "Useful for cautious framing: neural models of synesthesia are debated, and no single neuroimaging account should be presented as definitive.",
  },
};

export const narrativeFooterDisclaimer = [
  "This website is an educational and artistic interface about synesthesia.",
  "It is not a medical or diagnostic tool.",
  "Synesthetic experiences vary widely from person to person. The examples shown here are intended to explain cross-sensory perception, literary synesthesia, and artistic translation, not to define a universal synesthetic system.",
];

export const chapters: Chapter[] = [
  {
    id: "opening",
    eyebrow: "01 / OPENING",
    navLabel: "Opening",
    title: "When Words Turn Blue",
    subtitle: "Some words are read. Some words arrive with color.",
    body: [
      "In literature, a blue word may be a metaphor.",
      "In synesthesia, color may not be metaphorical at all. It may be an automatic experience triggered by a letter, a word, a sound, a number, or a moment in time.",
      "This website begins with literary synesthesia: the way language borrows from the senses. Then it moves toward neurological synesthesia: a less common perceptual phenomenon in which one kind of stimulus evokes another sensory or cognitive experience.",
    ],
    sourceKeys: ["mitSynesthesia", "clevelandSynesthesia"],
  },
  {
    id: "literary-synesthesia",
    eyebrow: "02 / Literary Senses",
    navLabel: "Literary Senses",
    title: "Before synesthesia, there was literary synesthesia.",
    subtitle: "Language has always borrowed from the senses.",
    body: [
      "Literary synesthesia is a rhetorical device. It happens when one sense is used to describe another.",
      "A sound can be sweet. A color can feel cold. A silence can be sharp. A scent can spread like music.",
      "In literature, this crossing of the senses is usually a language strategy. It helps readers imagine sensory overlap. But literary synesthesia is not the same as neurological synesthesia.",
    ],
    interaction: { type: "senseBridge" },
    sourceKeys: ["baudelaireCorrespondances", "britannicaVoyelles"],
  },
  {
    id: "what-is-synesthesia",
    eyebrow: "03 / Definition",
    navLabel: "Definition",
    title: "But some colors are not metaphors.",
    subtitle:
      "Synesthesia is when one stimulus automatically evokes another experience.",
    body: [
      "Synesthesia is a perceptual or cognitive trait in which one kind of stimulus automatically evokes an additional experience.",
      "A black letter may trigger a color. A sound may appear as a shape. A weekday may occupy a position in space. A word may carry a taste, temperature, or texture.",
      "The original stimulus is often called the inducer. The additional experience is often called the concurrent.",
      "Synesthetic experiences are highly personal. The same letter, number, or word may trigger completely different colors for different people. However, for the same person, these associations are often relatively stable over time.",
    ],
    interaction: { type: "inducerConcurrent" },
    sourceKeys: ["mitSynesthesia", "clevelandSynesthesia", "simner2006"],
  },
  {
    id: "neuroscience",
    eyebrow: "04 / Neuroscience",
    navLabel: "Neuroscience",
    title: "A brain can bind senses differently.",
    subtitle:
      "Synesthesia suggests that perception is not always separated by sense.",
    body: [
      "Synesthesia is not simply imagining a color. It may involve additional perceptual, conceptual, or neural pathways.",
      "A stimulus enters the brain. It is recognized as a letter, sound, word, number, or unit of time. At the same time, another experience may be activated: a color, a shape, a taste, a texture, or a spatial position.",
      "Researchers have proposed several explanations for synesthesia, including cross-activation between brain regions, differences in structural connectivity, conceptual association, attention, memory, and language processing.",
      "There is probably no single mechanism that explains every type of synesthesia.",
    ],
    interaction: { type: "neuralDiagram" },
    sourceKeys: [
      "mitSynesthesia",
      "ramachandranHubbard2001",
      "rouwScholte2007",
      "synesthesiaBattery",
      "clevelandSynesthesia",
      "hupeDojat2015",
    ],
  },
  {
    id: "exhibition",
    eyebrow: "05 / Exhibition",
    navLabel: "Exhibition",
    title: "A Small Exhibition of Crossed Senses",
    subtitle:
      "Poets, painters, and composers have long imagined relationships between color, sound, language, and form.",
    body: [
      "Poetry, painting, and music have long crossed the senses — but not every work proves neurological synesthesia.",
    ],
    interaction: { type: "exhibitWall" },
    sourceKeys: [
      "baudelaireCorrespondances",
      "lenbachhausKandinsky",
      "okeeffeMusicPinkBlue",
      "macdonaldWrightSynchromy",
    ],
  },
  {
    id: "personal-transition",
    eyebrow: "06 / Personal System",
    navLabel: "Personal System",
    title: "Switch to one person's sensory system.",
    subtitle: "From public examples to private perception.",
    body: [
      "So far, we have seen three forms of crossed senses.",
      "Literary synesthesia: language uses one sense to describe another.",
      "Artistic translation: painting, music, and poetry build systems between sound, color, language, and form.",
      "Neurological synesthesia: a stimulus automatically evokes an additional sensory or cognitive experience.",
      "The next section moves into a personal system: a model trained to approximate one person's synesthetic visual experience.",
    ],
    interaction: { type: "personalTransition" },
    sourceKeys: [],
  },
];
