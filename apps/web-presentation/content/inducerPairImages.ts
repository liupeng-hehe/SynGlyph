export type InducerPairImage = {
  src: string;
  alt: string;
  /** First word on the card (left wheel when active). */
  colorLabel: string;
  /** Second word on the card (right wheel when active). */
  emotionLabel: string;
  /** HEX printed on the card color bar. */
  hex: string;
  /** Copy printed on the original cards. */
  lines: [string, string];
};

/** page2 visuals — scroll order matches color/emotion wheel labels (index 0 = Red / Vitality). */
export const inducerPairImages: InducerPairImage[] = [
  {
    src: "/collab/page2/asset-1.png",
    alt: "Red and vitality color-emotion card",
    colorLabel: "Red",
    emotionLabel: "Vitality",
    hex: "#620b0e",
    lines: [
      "Red holds a ceremonial warmth — auspicious, passionate, and quietly powerful.",
      "It carries love, prosperity, and celebration like a pulse beneath the surface.",
    ],
  },
  {
    src: "/collab/page2/asset-2.png",
    alt: "Orange and optimism color-emotion card",
    colorLabel: "Orange",
    emotionLabel: "Optimism",
    hex: "#f4be18",
    lines: [
      "Orange holds a spirited warmth — quick-minded, curious, and bright with possibility.",
      "It moves like warm sunlight, turning energy into hope and attention into optimism.",
    ],
  },
  {
    src: "/collab/page2/asset-3.png",
    alt: "White and serenity color-emotion card",
    colorLabel: "White",
    emotionLabel: "Serenity",
    hex: "#f4f6f7",
    lines: [
      "White carries purity and calm — sincere, innocent, and softly untouched.",
      "It soothes restlessness into inner peace, like cloud, snow, and quiet light.",
    ],
  },
  {
    src: "/collab/page2/asset-4.png",
    alt: "Pink and tenderness color-emotion card",
    colorLabel: "Pink",
    emotionLabel: "Tenderness",
    hex: "#d9bcba",
    lines: [
      "Pink carries a softer kind of love — gentle, intimate, and quietly cared for.",
      "It holds affection softly, like petals and a quiet blush.",
    ],
  },
  {
    src: "/collab/page2/asset-5.png",
    alt: "Green and balance color-emotion card",
    colorLabel: "Green",
    emotionLabel: "Balance",
    hex: "#415b2a",
    lines: [
      "Green carries the calm of living things — balanced, breathing, and gently renewed.",
      "It gives the body somewhere to return, like fern shade, soft moss, and the quiet line of a leaf.",
    ],
  },
  {
    src: "/collab/page2/asset-6.png",
    alt: "Blue and calm color-emotion card",
    colorLabel: "Blue",
    emotionLabel: "Calm",
    hex: "#36608f",
    lines: [
      "Blue carries a quiet distance — cool, spacious, and gently composed.",
      "It slows the feeling down, like still water, and silk moving softly in light.",
    ],
  },
  {
    src: "/collab/page2/asset-7.png",
    alt: "Purple and inspired color-emotion card",
    colorLabel: "Purple",
    emotionLabel: "Inspired",
    hex: "#725588",
    lines: [
      "Purple carries a quiet elegance — noble, dreamlike, and deeply composed.",
      "It feels like a thought wrapped in dusk, where imagination becomes slower, richer, and more mysterious.",
    ],
  },
];
