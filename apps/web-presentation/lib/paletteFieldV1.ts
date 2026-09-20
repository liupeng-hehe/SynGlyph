/**
 * Palette + linear Field v1 — client port of scripts/eval_palette_field_v1.py.
 * Color = letter-mean Lab + sparse combo residual (th/sh/wh).
 * Prominence / spread = linear field on position, V/C context, onset, collocation.
 */

import { labToHex } from "./labColor";

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);
const COMBOS = ["th", "sh", "ch", "wh", "ph", "gh", "ck", "ng", "qu", "tion"] as const;

const FEATURE_KEYS = [
  "pos=first",
  "pos=mid",
  "pos=last",
  "self_v",
  "prev=none",
  "prev=V",
  "prev=C",
  "next=none",
  "next=V",
  "next=C",
  "onset=CV",
  "onset=CC",
  "onset=VC",
  "onset=VV",
  "onset=na",
  "combo=th",
  "combo=sh",
  "combo=ch",
  "combo=wh",
  "combo=ph",
  "combo=gh",
  "combo=ck",
  "combo=ng",
  "combo=qu",
  "combo=tion",
  "combo=none",
] as const;

const PALETTE_LAB: Record<string, [number, number, number]> = {
  a: [52.7000343554002, 76.51477879219377, 64.63260883205848],
  b: [7.439383908509068, -0.27372314353171356, -0.07486666599617382],
  c: [79.35117629201716, 10.712625305820408, 73.4963770165377],
  d: [8.088581845049488, -0.2327712718706111, -0.2843205027008154],
  e: [96.5742799552643, -4.483125080920742, 20.52936317694755],
  f: [69.24029006805814, -13.342874344943592, -34.62230598929763],
  g: [48.588677642679116, 39.51356456604544, -13.223579087930153],
  h: [47.44881723566738, 7.655191397845303, 40.31573794174234],
  i: [99.39038700944133, -0.5306771520831809, 0.1429146505565562],
  j: [58.91542461464311, 9.37855558694441, 52.90344303191447],
  k: [40.71105697849034, -43.360492394074065, 40.92213946946373],
  l: [96.78533946296135, -2.910872552998171, 15.141898841542552],
  m: [66.32208177735153, 11.667965278865392, 58.69957457470846],
  n: [57.297692345774216, 3.1073003862785744, 46.429652202182126],
  o: [99.47645909366132, -0.2290684095611529, 0.20533085482864433],
  p: [35.82960523758265, 48.86618148860639, -15.60628435878629],
  q: [34.24082782071877, 43.16682801753746, -9.440045021753534],
  r: [92.26318373459367, -23.045095100516555, 32.751293497905394],
  s: [65.26308812271728, 0.27881966281190973, -0.4523843771315182],
  t: [17.166970435380893, 46.93488639491388, -63.863435742059565],
  u: [40.72224759833513, -5.849001520530398, 29.080618065228684],
  v: [39.42362059720381, -41.414379326678144, 40.67452256421521],
  w: [12.19054361691503, 45.38066445984038, -61.56330149977566],
  x: [26.090601048682775, -27.830648864709442, 27.736278166619776],
  y: [94.9826249030797, -8.903989362430124, 33.15218842643845],
  z: [29.50664906309218, 41.88405499473622, 38.93758229730225],
};

const COMBO_RESIDUAL: Record<string, [number, number, number]> = {
  th: [2.063243037750025, -1.1988499671875295, 6.50422088678531],
  wh: [-1.0065534310321214, -1.2988404612295494, 4.567823592246639],
  sh: [-22.55391352302553, -2.160838877867041, -11.165834204148215],
};

/** Intercept + one weight per FEATURE_KEYS entry. */
const WEIGHT_P = [
  0.1211376391883833, 0.0452932346113174, -0.03593494859471712, 0.11177935316264831,
  -0.08961515665272067, 0.04529323461195221, 0.02167815891277175, 0.054166245657627274,
  -0.12095912392060934, 0.13539605694577417, 0.10670070615504655, 0.02834969226569667,
  0.05060532583886213, -0.026853195454449988, 0.22592988904216768, -0.15689407252039783,
  -0.04013646598693031, -0.01534717363093567, 0.04880530741062206, -0.19232090062014562,
  0.11817225288600014, 0.051334175688297685, 0.016217249193968122, -0.0001143594990938579,
  -0.03969479399352041, 0.0866454897985666, 0.08757685793575572,
];

const WEIGHT_S = [
  0.20816078942018543, -0.11507220265812484, -0.001420033900902258, 0.3246530259729271,
  0.11917801317492507, -0.11507220265805843, 0.17372288002954142, 0.14951011202599673,
  -0.021776400891774267, 0.08165750179732321, 0.14827968850836806, 0.09765681929062314,
  0.0545577524321367, -0.008797863172951914, 0.08794051565696466, -0.023196434856337565,
  -0.2142141221204186, -0.1898504015348062, -0.054936886012837687, -0.11354553985637061,
  0.048761514760013905, 0.10218398257427935, 0.26724378585755515, 0.13860250106454913,
  0.08787148447515497, 0.09729876956597458, 0.038745700615253946,
];

export type FieldPos = "first" | "mid" | "last";

export type PaletteFieldLetter = {
  ch: string;
  hex: string;
  lab: [number, number, number];
  prominence: number;
  spread: number;
  combo: string | null;
  pos: FieldPos;
};

export type MineGlyph = {
  text: string;
  hex: string | null;
  prominence: number;
  spread: number;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function isLetter(ch: string): boolean {
  return /[a-zA-Z]/.test(ch);
}

export function detectCombo(word: string, i: number): string | null {
  const n = word.length;
  const left = i > 0 ? word[i - 1]! + word[i]! : "";
  const right = i + 1 < n ? word[i]! + word[i + 1]! : "";
  for (const d of COMBOS) {
    if (d.length === 2 && (d === left || d === right)) return d;
    if (d.length > 2) {
      const idx = word.indexOf(d);
      if (idx !== -1 && idx <= i && i < idx + d.length) return d;
    }
  }
  return null;
}

function vc(ch: string | undefined): "none" | "V" | "C" {
  if (!ch) return "none";
  return VOWELS.has(ch) ? "V" : "C";
}

function onsetOf(ch: string, next: string | undefined): string {
  if (!next) return "na";
  const selfV = VOWELS.has(ch);
  const nextV = VOWELS.has(next);
  if (selfV && nextV) return "VV";
  if (selfV) return "VC";
  if (nextV) return "CV";
  return "CC";
}

function featurize(flags: Record<string, number>): number[] {
  return FEATURE_KEYS.map((key) => flags[key] ?? 0);
}

function predictLinear(weights: number[], x: number[]): number {
  let y = weights[0] ?? 0;
  for (let i = 0; i < x.length; i++) y += (weights[i + 1] ?? 0) * (x[i] ?? 0);
  return y;
}

function predictLab(ch: string, combo: string | null): [number, number, number] {
  const base = PALETTE_LAB[ch] ?? [50, 0, 0];
  const extra = (combo && COMBO_RESIDUAL[combo]) || [0, 0, 0];
  return [base[0] + extra[0], base[1] + extra[1], base[2] + extra[2]];
}

/** Predict one alphabetic word (already lowercased letters only). */
export function predictWord(word: string): PaletteFieldLetter[] {
  const w = word.toLowerCase();
  const n = w.length;
  const out: PaletteFieldLetter[] = [];
  for (let i = 0; i < n; i++) {
    const ch = w[i]!;
    const prev = i > 0 ? w[i - 1] : undefined;
    const next = i + 1 < n ? w[i + 1] : undefined;
    const pos: FieldPos = i === 0 ? "first" : i === n - 1 ? "last" : "mid";
    const combo = detectCombo(w, i);
    const onset = i === 0 ? onsetOf(ch, next) : "na";
    const flags: Record<string, number> = {
      [`pos=${pos}`]: 1,
      self_v: VOWELS.has(ch) ? 1 : 0,
      [`prev=${vc(prev)}`]: 1,
      [`next=${vc(next)}`]: 1,
      [`onset=${onset}`]: 1,
      [`combo=${combo ?? "none"}`]: 1,
    };
    const x = featurize(flags);
    const lab = predictLab(ch, combo);
    out.push({
      ch,
      hex: labToHex(lab[0], lab[1], lab[2]),
      lab,
      prominence: clamp01(predictLinear(WEIGHT_P, x)),
      spread: clamp01(predictLinear(WEIGHT_S, x)),
      combo,
      pos,
    });
  }
  return out;
}

/** Map a whitespace-delimited token onto glyphs, skipping punctuation in the Field word. */
export function glyphsForToken(token: string): MineGlyph[] {
  const letters = [...token].filter(isLetter).join("").toLowerCase();
  const preds = letters ? predictWord(letters) : [];
  let li = 0;
  return [...token].map((text) => {
    if (!isLetter(text)) {
      return { text, hex: null, prominence: 0, spread: 0 };
    }
    const pred = preds[li++];
    return {
      text,
      hex: pred?.hex ?? null,
      prominence: pred?.prominence ?? 0,
      spread: pred?.spread ?? 0,
    };
  });
}

export type MineWord = {
  glyphs: MineGlyph[];
  isSpace: boolean;
};

export function wordsForText(text: string): MineWord[] {
  const parts = text.split(/(\s+)/);
  const words: MineWord[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      words.push({ glyphs: [{ text: part, hex: null, prominence: 0, spread: 0 }], isSpace: true });
      continue;
    }
    words.push({ glyphs: glyphsForToken(part), isSpace: false });
  }
  return words;
}

export function glyphsForText(text: string): MineGlyph[] {
  return wordsForText(text).flatMap((word) => word.glyphs);
}
