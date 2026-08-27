export type NeuroscienceCard = {
  title: string;
  body: string[];
  caution: string;
};

export const neuroscienceCards: NeuroscienceCard[] = [
  {
    title: "Cross-Activation",
    body: [
      "One influential explanation is cross-activation.",
      "In grapheme-color synesthesia, areas involved in recognizing letters or numbers may interact unusually strongly with areas involved in color experience.",
      "This could help explain why a black printed letter may still evoke a color.",
    ],
    caution: "One possible model, not the only explanation.",
  },
  {
    title: "Structural Connectivity",
    body: [
      "Some studies examine whether synesthetes show differences in brain connectivity.",
      "Instead of asking only which brain areas become active, these studies ask how strongly different areas may be connected.",
      "In some research on grapheme-color synesthesia, synesthetes showed differences in white matter connectivity compared with non-synesthetes.",
    ],
    caution:
      "Connectivity findings are part of the evidence, but they do not fully explain every form of synesthesia.",
  },
  {
    title: "Projector and Associator Experiences",
    body: [
      "Some synesthetes experience the concurrent as if it appears in external space.",
      "Others experience it internally, in the mind's eye.",
      "These are often described as projector and associator forms of synesthetic experience.",
      "One is not necessarily more real than the other. They describe different locations or qualities of experience.",
    ],
    caution: "Different forms of experience can still be valid.",
  },
  {
    title: "Consistency Over Time",
    body: [
      "Researchers do not rely only on self-description.",
      "One common way to study synesthesia is to test whether a person gives consistent associations over time.",
      "For example, if someone says that A is red, researchers may test whether that person chooses a similar red again later.",
    ],
    caution: "This interaction is educational. It is not a diagnosis.",
  },
];
