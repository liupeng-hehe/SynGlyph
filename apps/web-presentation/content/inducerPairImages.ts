export type InducerPairImage = {
  src: string;
  alt: string;
  /** First word on the card (left wheel when active). */
  colorLabel: string;
  /** Second word on the card (right wheel when active). */
  emotionLabel: string;
};

/** page2 visuals — scroll order matches color/emotion wheel labels (index 0 = Red / Vitality). */
export const inducerPairImages: InducerPairImage[] = [
  {
    src: "/collab/page2/asset-1.png",
    alt: "Red and vitality color-emotion card",
    colorLabel: "Red",
    emotionLabel: "Vitality",
  },
  {
    src: "/collab/page2/asset-2.png",
    alt: "Orange and optimism color-emotion card",
    colorLabel: "Orange",
    emotionLabel: "Optimism",
  },
  {
    src: "/collab/page2/asset-3.png",
    alt: "White and serenity color-emotion card",
    colorLabel: "White",
    emotionLabel: "Serenity",
  },
  {
    src: "/collab/page2/asset-4.png",
    alt: "Pink and tenderness color-emotion card",
    colorLabel: "Pink",
    emotionLabel: "Tenderness",
  },
  {
    src: "/collab/page2/asset-5.png",
    alt: "Green and balance color-emotion card",
    colorLabel: "Green",
    emotionLabel: "Balance",
  },
  {
    src: "/collab/page2/asset-6.png",
    alt: "Blue and calm color-emotion card",
    colorLabel: "Blue",
    emotionLabel: "Calm",
  },
];
