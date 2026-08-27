import type {
  LetterColor,
  PdfDocumentSettings,
  StudioPersistence,
  UserProfile,
} from "./types";

const LETTERS_KEY = "synesthetic-studio-letters-v1";
const PERSIST_KEY = "synesthetic-studio-persistence-v1";

export const defaultPdfSettings: PdfDocumentSettings = {
  backgroundIntensity: 38,
  textContrast: 88,
  pageSize: "A4",
  fontFamily: "Helvetica",
  margins: { top: 56, right: 52, bottom: 56, left: 52 },
};

export function loadLetters(): LetterColor[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LETTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LetterColor[];
    if (!Array.isArray(parsed) || parsed.length !== 26) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLetters(letters: LetterColor[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LETTERS_KEY, JSON.stringify(letters));
}

export function loadPersistence(): StudioPersistence | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StudioPersistence;
    if (p.version !== 1 || !Array.isArray(p.palettes) || !Array.isArray(p.profiles))
      return null;
    return p;
  } catch {
    return null;
  }
}

export function savePersistence(p: StudioPersistence): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PERSIST_KEY, JSON.stringify(p));
}

export function emptyPersistence(): StudioPersistence {
  const profile: UserProfile = {
    id: crypto.randomUUID(),
    displayName: "Default profile",
  };
  return {
    version: 1,
    activeProfileId: profile.id,
    profiles: [profile],
    palettes: [],
  };
}

export function ensurePersistence(): StudioPersistence {
  const existing = loadPersistence();
  if (existing) return existing;
  const fresh = emptyPersistence();
  savePersistence(fresh);
  return fresh;
}
