export type SynestheteProfile = {
  id: string;
  name: string;
  type: string;
  work: string;
  description: string;
  image: {
    src: string;
    alt: string;
  };
};

export const synestheteProfiles: SynestheteProfile[] = [
  {
    id: "carol-steen",
    name: "Carol Steen",
    type: "Sound, touch, pain, smell, and taste → visual photisms",
    work: "Alphabet",
    description:
      "Carol Steen's paintings translate her own synesthetic photisms — colors, forms, and movements triggered by sensory experiences — into abstract visual compositions.",
    image: {
      src: "/collab/page6/carol-steen.jpg",
      alt: "Carol Steen, Alphabet",
    },
  },
  {
    id: "olivier-messiaen",
    name: "Olivier Messiaen",
    type: "Sound–color synesthesia",
    work: "Harmonic color systems in composition",
    description:
      "Olivier Messiaen experienced musical harmonies as vivid and stable color combinations, shaping both his compositional language and his teaching.",
    image: {
      src: "/collab/page6/olivier-messiaen.webp",
      alt: "Olivier Messiaen album cover",
    },
  },
  {
    id: "daniel-tammet",
    name: "Daniel Tammet",
    type: "Number–form, word–color, emotion–color, spatial-form",
    work: "Born on a Blue Day",
    description:
      "Daniel Tammet's memoir presents synesthesia as deeply connected to memory, mathematics, language, and identity.",
    image: {
      src: "/collab/page6/daniel-tammet.jpg",
      alt: "Born on a Blue Day cover",
    },
  },
  {
    id: "wassily-kandinsky",
    name: "Wassily Kandinsky",
    type: "Sound, color, and form correspondences",
    work: "Yellow-Red-Blue",
    description:
      "Wassily Kandinsky's abstract art is grounded in the belief that color, sound, and form share deep inner correspondences.",
    image: {
      src: "/collab/page6/wassily-kandinsky.webp",
      alt: "Wassily Kandinsky, Yellow-Red-Blue",
    },
  },
  {
    id: "marcia-smilack",
    name: "Marcia Smilack",
    type: "Sound, texture, movement, and taste in reflection photography",
    work: "Synesthetic reflection photography",
    description:
      "Marcia Smilack's reflection photography is guided by synesthetic responses to moving water, where visual forms evoke music, texture, movement, or taste.",
    image: {
      src: "/collab/page6/marcia-smilack.jpg",
      alt: "Marcia Smilack reflection photography",
    },
  },
  {
    id: "melissa-mccracken",
    name: "Melissa McCracken",
    type: "Sound–color synesthesia",
    work: "Paintings of specific songs",
    description:
      "Melissa McCracken translates her sound–color synesthesia into abstract paintings tied to specific songs.",
    image: {
      src: "/collab/page6/melissa-mccracken.webp",
      alt: "Melissa McCracken synesthetic painting",
    },
  },
  {
    id: "sean-day",
    name: "Sean A. Day",
    type: "Multiple forms; congenital synesthete",
    work: "The Synesthesia List & community leadership",
    description:
      "Sean A. Day is a synesthesia researcher, educator, and congenital synesthete who has helped build international synesthesia communities.",
    image: {
      src: "/collab/page6/sean-day.jpg",
      alt: "Synesthesia and Synesthetes cover",
    },
  },
];
