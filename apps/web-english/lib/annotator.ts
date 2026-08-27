/**
 * Annotator (user) and role management.
 * Stored in localStorage.
 */
const ANNOTATOR_KEY = "synglyph_annotator";
const ANNOTATORS_LIST_KEY = "synglyph_annotators_list";
const ALPHABET_SOURCE_KEY = "synglyph_annotator_alphabet_source";
const USER_ROLE_KEY = "synglyph_user_role";

export const DEFAULT_ANNOTATORS = ["A", "B", "C"];
export type UserRole = "default" | "admin";

export function getAnnotatorsList(): string[] {
  if (typeof window === "undefined") return DEFAULT_ANNOTATORS;
  try {
    const raw = localStorage.getItem(ANNOTATORS_LIST_KEY);
    if (!raw) return DEFAULT_ANNOTATORS;
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_ANNOTATORS;
  } catch {
    return DEFAULT_ANNOTATORS;
  }
}

export function setAnnotatorsList(list: string[]): void {
  localStorage.setItem(ANNOTATORS_LIST_KEY, JSON.stringify(list));
}

export function addAnnotator(name: string): string[] {
  const list = getAnnotatorsList();
  const trim = name.trim();
  if (!trim || list.includes(trim)) return list;
  const next = [...list, trim];
  setAnnotatorsList(next);
  return next;
}

export function removeAnnotator(name: string): string[] {
  const list = getAnnotatorsList().filter((a) => a !== name);
  setAnnotatorsList(list);
  return list;
}

export function getCurrentAnnotator(): string {
  if (typeof window === "undefined") return "A";
  const v = localStorage.getItem(ANNOTATOR_KEY);
  const list = getAnnotatorsList();
  if (v && list.includes(v)) return v;
  return list[0] ?? "A";
}

export function setCurrentAnnotator(id: string): void {
  localStorage.setItem(ANNOTATOR_KEY, id);
}

export function getUserRole(): UserRole {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(USER_ROLE_KEY);
  return v === "admin" ? "admin" : "default";
}

export function setUserRole(role: UserRole): void {
  localStorage.setItem(USER_ROLE_KEY, role);
}

export function getAnnotatorAlphabetSource(annotator: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ALPHABET_SOURCE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, string>;
    return obj[annotator] ?? null;
  } catch {
    return null;
  }
}

export function setAnnotatorAlphabetSource(annotator: string, datasetId: string): void {
  const raw = localStorage.getItem(ALPHABET_SOURCE_KEY);
  let obj: Record<string, string> = {};
  try {
    if (raw) obj = JSON.parse(raw);
  } catch {
    // ignore
  }
  obj[annotator] = datasetId;
  localStorage.setItem(ALPHABET_SOURCE_KEY, JSON.stringify(obj));
}
