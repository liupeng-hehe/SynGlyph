export type InducerPairImage = {
  src: string;
  alt: string;
  /** Photographs for this color, in layer order. Neighbors share the scroll. */
  photos: string[];
  /** First word on the card (left wheel when active). */
  colorLabel: string;
  /** Second word on the card (right wheel when active). */
  emotionLabel: string;
  /** HEX printed on the card color bar. */
  hex: string;
  /** Copy printed on the original cards. */
  lines: [string, string];
};

const colorPhoto = (folder: string, file: string) => `/collab/page2/${folder}/${file}`;

/** page2 visuals — scroll order is red, orange, white, pink, green, blue, purple. */
export const inducerPairImages: InducerPairImage[] = [
  {
    src: colorPhoto("red", "anita-austvika-J24y6727i7s-unsplash.jpg"),
    photos: [
      "anita-austvika-J24y6727i7s-unsplash.jpg",
      "erol-ahmed-huzRVx9SND0-unsplash.jpg",
      "gabrielle-maurer-wxipfbSyu_Y-unsplash.jpg",
      "hasan-almasi-vK7zYg4wUBY-unsplash.jpg",
      "my-fairytale-garden-tyuwKtI0mWk-unsplash.jpg",
      "nikita-pishchugin-InPQI9IaIgk-unsplash.jpg",
      "sandie-peters-KrFolVcJDCs-unsplash.jpg",
      "valeria-bold-LVGnZT1aP2M-unsplash.jpg",
    ].map((file) => colorPhoto("red", file)),
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
    src: colorPhoto("orange", "aaron-burden-CWzulMwRATQ-unsplash.jpg"),
    photos: [
      "aaron-burden-CWzulMwRATQ-unsplash.jpg",
      "anna-leonenko-kVNghR5wD-o-unsplash.jpg",
      "boys-in-bristol-photography-snBGWbelfoc-unsplash.jpg",
      "damir-korotaj-2UKAISoML3Y-unsplash.jpg",
      "jsb-co-KdNRMVb_lMg-unsplash.jpg",
      "maria-klichik-hWQoKSYtolM-unsplash.jpg",
      "matea-gvozdenovic-lTKRcw4dQJg-unsplash.jpg",
      "todd-trapani-KDVl4JG7PZU-unsplash.jpg",
    ].map((file) => colorPhoto("orange", file)),
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
    src: colorPhoto("white", "engin-akyurt-CQow1jgKpew-unsplash.jpg"),
    photos: [
      "engin-akyurt-CQow1jgKpew-unsplash.jpg",
      "evie-s-cmbbwn-2Ilw-unsplash.jpg",
      "ice-cube-QDzzZZHFz-U-unsplash.jpg",
      "leandra-rieger-AYuikG3zBR8-unsplash.jpg",
      "mehmet-keskin-CHKPpH62QNk-unsplash.jpg",
      "pascal-bullan-VGPR-wEY_wE-unsplash.jpg",
      "tsuyoshi-kozu-tSaCA1IhUCY-unsplash.jpg",
      "yoksel-zok-3LY2ZnuYBfo-unsplash.jpg",
    ].map((file) => colorPhoto("white", file)),
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
    src: colorPhoto("pink", "aarn-giri-B1cJcYPoFxY-unsplash.jpg"),
    photos: [
      "aarn-giri-B1cJcYPoFxY-unsplash.jpg",
      "anita-austvika-Izi4XT4YsGs-unsplash.jpg",
      "brigitte-elsner-2BP_1h_juXc-unsplash.jpg",
      "eugene-golovesov-je19h1LPtUg-unsplash.jpg",
      "olivie-strauss-V4u48rGvuks-unsplash.jpg",
      "paul-lichtblau-y1bTR6IEkiw-unsplash.jpg",
      "tim-schmidbauer-o-OHtYbCkLs-unsplash.jpg",
      "tim-schmidbauer-z2hGi5tZlj8-unsplash.jpg",
    ].map((file) => colorPhoto("pink", file)),
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
    src: colorPhoto("green", "aaron-burden-yzgF-AQt1sQ-unsplash.jpg"),
    photos: [
      "aaron-burden-yzgF-AQt1sQ-unsplash.jpg",
      "amir-reza-mansouri-8R2_4J24F2w-unsplash.jpg",
      "eugene-golovesov-gU5r6QNM1R4-unsplash.jpg",
      "joe-dudeck-ziHD5HqCOYg-unsplash.jpg",
      "laura-adai-rAo0RsMYWe4-unsplash.jpg",
      "omid-armin-AuYEtvM-y2k-unsplash.jpg",
      "polina-kuzovkova-YQXtf67ZEcU-unsplash.jpg",
      "ripa-mehrab-l7OYO577GLY-unsplash.jpg",
    ].map((file) => colorPhoto("green", file)),
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
    src: colorPhoto("blue", "claude-laprise-XUiZwyVpHDw-unsplash.jpg"),
    photos: [
      "claude-laprise-XUiZwyVpHDw-unsplash.jpg",
      "ivanna-skorobohatko-rpjcI5vyi-g-unsplash.jpg",
      "maria-gavrilova-0_R0m-7uQqk-unsplash.jpg",
      "mike-uderevsky-Aue1F2cdbHg-unsplash.jpg",
      "polina-kuzovkova-5RluZE1I-2I-unsplash.jpg",
      "robert-zunikoff-cMk9E8pPk9o-unsplash.jpg",
      "yanping-ma-ArCeHIfyoq0-unsplash.jpg",
      "yuri-antonenko-fMD-V3bDgRI-unsplash.jpg",
    ].map((file) => colorPhoto("blue", file)),
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
    src: colorPhoto("purple", "ban-bon-1JT7ajooBXw-unsplash.jpg"),
    photos: [
      "ban-bon-1JT7ajooBXw-unsplash.jpg",
      "carlos-dominguez-olalla-JxHHwLbZcvw-unsplash.jpg",
      "cody-f-WKJzy2wVdTQ-unsplash.jpg",
      "daniel-mirlea-zP2--9Gh5hA-unsplash.jpg",
      "danielle-suijkerbuijk-rAEqJxASUDU-unsplash.jpg",
      "grant-sams-lW9s_T5zjvM-unsplash.jpg",
      "jan-allbeck-pJukyVaEotI-unsplash.jpg",
      "monika-grabkowska-xIa4JA5RpGU-unsplash.jpg",
      "steph-LAzJs4PugxE-unsplash.jpg",
    ].map((file) => colorPhoto("purple", file)),
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
