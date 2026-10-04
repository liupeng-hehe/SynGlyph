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
    title: "When words begin to turn blue, are they still the same words?",
    subtitle: "Some words are read. Some words arrive with color.",
    body: [],
    sourceKeys: ["mitSynesthesia", "clevelandSynesthesia"],
  },
  {
    id: "opening-prose",
    eyebrow: "02 / PROLOGUE",
    navLabel: "Prologue",
    title: "At first, only the glyph.",
    body: [
      "A form, precise and visible.\nThen, a nuance.",
      "Something begins to accompany it—\na warmth, a tone, a color\nthat does not alter the form,\nyet somehow belongs to it.\nThe glyph remains exactly where it is.\nWhat changes is what arrives with it.\nAnother layer of experience.\nA presence carried by the form,\ninseparable from it,\neven when nothing on the page\nappears to have changed.",
      "Then the color falls away.\nThe page returns to pink and white.\nWhat remains is the impression that something had been there all along.\nThe color is not on the page.\nIt exists somewhere between what I see and what I feel.\nNow, try the filter yourself.",
    ],
  },
  {
    id: "what-is-synesthesia",
    eyebrow: "03 / DEFINITION",
    navLabel: "Definition",
    title: "Synesthesia: A Union of Senses",
    subtitle:
      "From the Greek syn- meaning “together” and aisthesis meaning “sensation.”",
    body: [
      "Color can move with sound, hold emotion, shape memory, or become an atmosphere of its own.",
      "In synesthesia, these crossings are not only artistic gestures, but part of perception itself.",
      "Synesthesia describes an automatic connection between senses and concepts, where letters may carry colors, sounds may suggest shapes, or time may seem to take up space.",
    ],
    sourceKeys: ["mitSynesthesia", "clevelandSynesthesia", "simner2006"],
  },
  {
    id: "exhibition",
    eyebrow: "04 / MULTISENSORY ARTWORKS",
    navLabel: "Artworks",
    title: "Multisensory Artworks",
    subtitle:
      "Poets, painters, composers, and artists who have long imagined relationships between color, sound, language, scent, and form.",
    body: [
      "These works do not always prove neurological synesthesia — but they show how artists have translated one sense into another.",
    ],
    sourceKeys: [
      "britannicaVoyelles",
      "okeeffeMusicPinkBlue",
      "scriabinPrometheus",
    ],
  },
  {
    id: "synesthesia-sparks",
    eyebrow: "05 / DEFINITION",
    navLabel: "Definition",
    title: "Synesthesia: A Union of Senses",
    subtitle:
      'From the Greek syn-, "together," and aisthēsis, "sensation."',
    body: [
      "Color can move with sound, carry emotion, shape memory, or become an atmosphere of its own.",
      "In synesthesia, these crossings are more than artistic gestures. They are part of perception itself.",
      "For some people, these crossings aren't a metaphor. They happen on their own: letters carry color, sounds have shape, and time takes up space.",
    ],
    sourceKeys: ["simner2006", "mitSynesthesia", "clevelandSynesthesia"],
  },
  {
    id: "personal-transition",
    eyebrow: "06 / NOW, MINE",
    navLabel: "Now, Mine",
    title: "Now, Mine",
    subtitle: "From public examples to one person's sensory system.",
    body: [
      "I first became aware that numbers had colors for me when I was in fifth grade. Back then, I shared it with a close friend. I thought of it as a small, interesting secret, something that felt completely natural to me. But the look of confusion on my friend's face made me realize, for the first time, that not everyone experienced numbers this way.",
      "That changed when I was fourteen and read Born on a Blue Day. It was the first time I encountered the word “synesthesia.” I remember feeling incredibly excited. That was when I realized I was a grapheme-color synesthete.",
      "And it wasn't just numbers or English letters. As a native Chinese speaker, I also see Chinese characters in color. In fact, Chinese feels even more complex to me than English or numbers. The structure of a character, its radicals, its shape, its meaning, and sometimes even the way it sits inside a phrase can all affect the color I perceive.",
      "Maybe the most obvious answer is memory. When I see the words “wonder” and “wander,” the difference between them feels immediate to me: one is white, and the other is red.",
      "That question is probably the main reason I wanted to build this website. I am still developing the part of this project that focuses on Chinese characters. My goal is to use coding as a way to recreate, as closely as possible, the color changes I see in my mind — an attempt to show how I see the world.",
    ],
    sourceKeys: [],
  },
  {
    id: "synesthetes",
    eyebrow: "07 / SYNESTHETES",
    navLabel: "Synesthetes",
    title: "Synesthetes and Key Figures",
    subtitle: "Artists, composers, writers, and researchers whose work makes cross-sensory perception visible.",
    body: [
      "These figures help show how synesthesia can become a structural force in art, music, literature, and community — not only a private sensation.",
    ],
    sourceKeys: ["mitSynesthesia"],
  },
];
