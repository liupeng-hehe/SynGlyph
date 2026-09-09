export type InducerPairImage = {
  src: string;
  alt: string;
  /** First word on the card (left wheel when active). */
  colorLabel: string;
  /** Second word on the card (right wheel when active). */
  emotionLabel: string;
  /** HEX printed on the card color bar. */
  hex: string;
};

/** page2 visuals — scroll order matches color/emotion wheel labels (index 0 = Red / Vitality). */
export const inducerPairImages: InducerPairImage[] = [
  {
    src: "/collab/page2/asset-1.png",
    alt: "Red and vitality color-emotion card",
    colorLabel: "Red",
    emotionLabel: "Vitality",
    hex: "#620b0e",
  },
  {
    src: "/collab/page2/asset-2.png",
    alt: "Orange and optimism color-emotion card",
    colorLabel: "Orange",
    emotionLabel: "Optimism",
    hex: "#f4be18",
  },
  {
    src: "/collab/page2/asset-3.png",
    alt: "White and serenity color-emotion card",
    colorLabel: "White",
    emotionLabel: "Serenity",
    hex: "#f4f6f7",
  },
  {
    src: "/collab/page2/asset-4.png",
    alt: "Pink and tenderness color-emotion card",
    colorLabel: "Pink",
    emotionLabel: "Tenderness",
    hex: "#d9bcba",
  },
  {
    src: "/collab/page2/asset-5.png",
    alt: "Green and balance color-emotion card",
    colorLabel: "Green",
    emotionLabel: "Balance",
    hex: "#415b2a",
  },
  {
    src: "/collab/page2/asset-6.png",
    alt: "Blue and calm color-emotion card",
    colorLabel: "Blue",
    emotionLabel: "Calm",
    hex: "#36608f",
  },
  {
    src: "/collab/page2/asset-7.png",
    alt: "Purple and inspired color-emotion card",
    colorLabel: "Purple",
    emotionLabel: "Inspired",
    hex: "#725588",
  },
];
