export type NeuroscienceScrollSlide = {
  id: string;
  src: string;
  alt: string;
  caption: string;
};

export const neuroscienceScrollSlides: NeuroscienceScrollSlide[] = [
  {
    id: "pathways",
    src: "/neuroscience/scroll-01.png",
    alt: "Abstract light trail on a dark field, suggesting neural activation",
    caption:
      "A stimulus enters the brain. Recognition and meaning may run in parallel with an additional sensory pathway.",
  },
  {
    id: "colour-field",
    src: "/neuroscience/scroll-02.png",
    alt: "Visual language colour field with letter and number nodes",
    caption:
      "Letters and numbers can carry stable colour fields — one person's alphabet may look like a private map.",
  },
  {
    id: "connectivity",
    src: "/neuroscience/scroll-03.png",
    alt: "Paint splashes and scribbled lines forming a dense network",
    caption:
      "Researchers study whether unusual connectivity between regions helps explain cross-sensory binding.",
  },
  {
    id: "spectrum",
    src: "/neuroscience/scroll-04.png",
    alt: "Brain with a spectrum of paint and musical notation",
    caption:
      "Sound, colour, and form may co-activate — synesthesia is not one mechanism, but many possible crossings.",
  },
];
