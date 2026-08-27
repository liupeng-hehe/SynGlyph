import type { SourceKey } from "./synesthesiaContent";

export type ExhibitImageFit = "cover" | "contain";

export type ExhibitImage = {
  src: string;
  alt: string;
  credit: string;
  fit?: ExhibitImageFit;
};

export type Exhibit = {
  id: string;
  artist: string;
  work: string;
  year: string;
  type: string;
  path: string;
  caption: string;
  /** Curatorial paragraphs — shown only in the hover overlay */
  note: string[];
  quote?: string;
  sourceKeys: SourceKey[];
  accentColor: string;
  image: ExhibitImage;
};

export const exhibitWallIntro = {
  kicker: "03 / Multisensory Artworks",
  title: "Works that cross the senses",
  lead: "Poets, painters, composers, and artists who translate one sense into another.",
  scrollHint: "Scroll sideways",
};

export const exhibits: Exhibit[] = [
  {
    id: "rimbaud-voyelles",
    artist: "Arthur Rimbaud",
    work: "Voyelles",
    year: "1871 / 1872",
    type: "Poem",
    path: "Letters → Colors",
    caption: "Vowel–color associations in poetry.",
    note: [
      "Arthur Rimbaud's Voyelles assigns distinct colors to each vowel, creating one of literature's most iconic examples of cross-sensory imagery.",
      "Whether read as synesthetic perception or poetic invention, the poem remains central to discussions of language, color, and sensory association.",
    ],
    quote: "A black, E white, I red, U green, O blue.",
    sourceKeys: ["britannicaVoyelles"],
    accentColor: "#FF6B6B",
    image: {
      src: "/collab/page3/voyelles.jpg",
      alt: "Voyelles — vowel–color associations in poetry",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
  {
    id: "okeeffe-music-pink-blue",
    artist: "Georgia O'Keeffe",
    work: "Music—Pink and Blue",
    year: "1918",
    type: "Painting",
    path: "Music → Abstract Visual Form",
    caption: "Translating music into abstract visual form.",
    note: [
      "In Music—Pink and Blue, Georgia O'Keeffe transforms the rhythm and movement of music into luminous abstract forms.",
      "Although not a documented synesthete, O'Keeffe's work reflects a synesthetic approach to translating sound into color, shape, and visual motion.",
    ],
    sourceKeys: ["okeeffeMusicPinkBlue"],
    accentColor: "#E8A0BF",
    image: {
      src: "/collab/page3/music-pink-blue.jpg",
      alt: "Georgia O'Keeffe, Music—Pink and Blue",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
  {
    id: "wilfred-lumia",
    artist: "Thomas Wilfred",
    work: "Lumia",
    year: "1920s–1950s",
    type: "Light art",
    path: "Light → Motion → Rhythm",
    caption: "Lumia and visual music.",
    note: [
      "Thomas Wilfred's Lumia works use light, color, motion, and rhythm to create a time-based visual art form independent of music.",
      "His practice remains a landmark in visual music and cross-modal abstraction, transforming light itself into an expressive medium.",
    ],
    sourceKeys: ["mitSynesthesia"],
    accentColor: "#7B61FF",
    image: {
      src: "/collab/page3/wilfred-lumia.jpg",
      alt: "Thomas Wilfred, Clavilux / Lumia",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
  {
    id: "fischinger-optical-poem",
    artist: "Oskar Fischinger",
    work: "An Optical Poem",
    year: "1938",
    type: "Animation",
    path: "Music → Motion → Form",
    caption: "Visual music animation.",
    note: [
      "Oskar Fischinger's An Optical Poem translates musical rhythm and structure into synchronized abstract animation.",
      "The film is a classic example of visual music, showing how sound can be reimagined through movement, color, and geometric form.",
    ],
    sourceKeys: ["mitSynesthesia"],
    accentColor: "#FFD447",
    image: {
      src: "/collab/page3/optical-poem.jpg",
      alt: "An Optical Poem by Oskar Fischinger",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
  {
    id: "scriabin-prometheus",
    artist: "Alexander Scriabin",
    work: "Prometheus: The Poem of Fire",
    year: "1910",
    type: "Music / Light",
    path: "Sound → Light → Color",
    caption: "Audiovisual vision in performance.",
    note: [
      "Modern performances of Scriabin's Prometheus: The Poem of Fire use digital lighting and projection technologies to realize the score's original color-light component.",
      "These productions transform the work into a unified audiovisual experience, making it a landmark in visual music and immersive performance.",
    ],
    sourceKeys: ["scriabinPrometheus"],
    accentColor: "#00B8D9",
    image: {
      src: "/collab/page3/prometheus.jpg",
      alt: "Modern performance of Prometheus: The Poem of Fire",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
  {
    id: "tolaas-scent",
    artist: "Sissel Tolaas",
    work: "Smell as Information",
    year: "1990s–present",
    type: "Olfactory art",
    path: "Scent → Memory → Presence",
    caption: "Smell as information and olfactory art.",
    note: [
      "Sissel Tolaas uses smell as an artistic and informational medium, transforming places, emotions, and identities into olfactory experiences.",
      "Her work challenges the dominance of vision in art by showing how scent can communicate invisible forms of memory, fear, and human presence.",
    ],
    sourceKeys: ["mitSynesthesia"],
    accentColor: "#2D6A4F",
    image: {
      src: "/collab/page3/tolaas.jpg",
      alt: "Sissel Tolaas working with scent materials",
      credit: "Collaborator draft",
      fit: "cover",
    },
  },
];
