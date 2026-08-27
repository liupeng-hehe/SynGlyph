"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

import {
  fetchByoHandoffFromProfile,
} from "@/lib/colorStudio/byoHandoff";
import {
  applyHexToLetterColor,
  applyHexToSuggested,
  defaultLetters,
  generateExampleLetters,
  softenRawBackground,
} from "@/lib/colorStudio/colorUtils";
import { prewarmLetterMasksAsync } from "@/lib/colorStudio/letterMaskCache";
import {
  clampPassageBox,
  createPassageTextBox,
  nextPassageBoxPlacement,
} from "@/lib/colorStudio/passageBoxes";
import {
  defaultPdfSettings,
  emptyPersistence,
  loadLetters,
  loadPersistence,
  saveLetters,
  savePersistence,
} from "@/lib/colorStudio/storage";
import type {
  LetterColor,
  PassageTextBox,
  PdfDocumentSettings,
  StudioPersistence,
  SuggestedTextColor,
  UserProfile,
} from "@/lib/colorStudio/types";

export type StudioTab = "letters" | "textPdf";

const BOOTSTRAP_PERSISTENCE: StudioPersistence = {
  version: 1,
  activeProfileId: "bootstrap",
  profiles: [{ id: "bootstrap", displayName: "Default profile" }],
  palettes: [],
};

export type StudioState = {
  tab: StudioTab;
  letters: LetterColor[];
  passageBoxes: PassageTextBox[];
  activePassageBoxId: string | null;
  feelings: string[];
  customFeelingInput: string;
  suggestion: SuggestedTextColor | null;
  suggestionTryCount: number;
  rawBackgroundHex: string | null;
  renderedBackgroundHex: string | null;
  pdfSettings: PdfDocumentSettings;
  persistence: StudioPersistence;
  hydrated: boolean;
  /** Set when palette was imported from Build Your Own handoff. */
  byoHandoffName: string | null;
  /** Lab profile id for model-backed passage preview (BYO handoff). */
  labProfileId: string | null;
};

type Action =
  | { type: "HYDRATE"; letters?: LetterColor[]; persistence: StudioPersistence }
  | { type: "SET_TAB"; tab: StudioTab }
  | { type: "SET_LETTERS"; letters: LetterColor[] }
  | { type: "UPDATE_LETTER"; index: number; letter: LetterColor }
  | { type: "GENERATE_EXAMPLE" }
  | { type: "IMPORT_LETTERS"; letters: LetterColor[] }
  | { type: "SET_PASSAGE_BOX_TEXT"; id: string; text: string }
  | { type: "ADD_PASSAGE_BOX" }
  | { type: "UPDATE_PASSAGE_BOX"; id: string; patch: Partial<PassageTextBox> }
  | { type: "DELETE_PASSAGE_BOX"; id: string }
  | { type: "SET_ACTIVE_PASSAGE_BOX"; id: string | null }
  | { type: "SET_FEELINGS"; feelings: string[] }
  | { type: "SET_CUSTOM_FEELING_INPUT"; text: string }
  | { type: "SET_SUGGESTION"; suggestion: SuggestedTextColor | null }
  | { type: "BUMP_TRY_COUNT" }
  | { type: "APPLY_HEX_TO_SUGGESTION"; hex: string; naming?: "local" | "api" }
  | { type: "SET_SUGGESTION_CUSTOM_NAME"; name: string | undefined }
  | { type: "CLEAR_SUGGESTION_CUSTOM_NAME" }
  | { type: "USE_SUGGESTION_AS_BACKGROUND" }
  | { type: "SET_PDF_SETTINGS"; patch: Partial<PdfDocumentSettings> }
  | { type: "SET_RAW_BACKGROUND"; hex: string | null }
  | { type: "SAVE_PALETTE"; name: string }
  | { type: "LOAD_PALETTE"; id: string }
  | { type: "DELETE_PALETTE"; id: string }
  | { type: "SET_ACTIVE_PROFILE"; id: string }
  | { type: "UPSERT_PROFILE"; profile: UserProfile }
  | { type: "ADD_PROFILE"; displayName: string }
  | { type: "SET_BYO_HANDOFF_NAME"; name: string | null }
  | { type: "SET_LAB_PROFILE_ID"; id: string | null };

function renderBg(raw: string | null, intensity: number): string | null {
  if (!raw) return null;
  return softenRawBackground(raw, intensity);
}

function studioReducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "HYDRATE": {
      return {
        ...state,
        letters: action.letters ?? state.letters,
        persistence: action.persistence,
        hydrated: true,
      };
    }
    case "SET_TAB":
      return { ...state, tab: action.tab };
    case "SET_LETTERS":
      return { ...state, letters: action.letters };
    case "UPDATE_LETTER": {
      const next = [...state.letters];
      next[action.index] = action.letter;
      return { ...state, letters: next };
    }
    case "GENERATE_EXAMPLE":
      return { ...state, letters: generateExampleLetters() };
    case "IMPORT_LETTERS": {
      const byLetter = new Map(action.letters.map((l) => [l.letter.toUpperCase(), l]));
      const merged = state.letters.map((slot) => {
        const hit = byLetter.get(slot.letter);
        if (!hit) return slot;
        return {
          ...hit,
          letter: slot.letter,
          customColorName: hit.customColorName ?? slot.customColorName,
        };
      });
      return { ...state, letters: merged };
    }
    case "SET_PASSAGE_BOX_TEXT": {
      const boxes = state.passageBoxes.map((b) =>
        b.id === action.id ? { ...b, text: action.text } : b,
      );
      return { ...state, passageBoxes: boxes };
    }
    case "ADD_PASSAGE_BOX": {
      const box = clampPassageBox(
        createPassageTextBox(nextPassageBoxPlacement(state.passageBoxes.length)),
      );
      return {
        ...state,
        passageBoxes: [...state.passageBoxes, box],
        activePassageBoxId: box.id,
      };
    }
    case "UPDATE_PASSAGE_BOX": {
      const boxes = state.passageBoxes.map((b) =>
        b.id === action.id
          ? clampPassageBox({ ...b, ...action.patch, id: b.id })
          : b,
      );
      return { ...state, passageBoxes: boxes };
    }
    case "DELETE_PASSAGE_BOX": {
      if (state.passageBoxes.length <= 1) return state;
      const boxes = state.passageBoxes.filter((b) => b.id !== action.id);
      const activePassageBoxId =
        state.activePassageBoxId === action.id
          ? (boxes[0]?.id ?? null)
          : state.activePassageBoxId;
      return { ...state, passageBoxes: boxes, activePassageBoxId };
    }
    case "SET_ACTIVE_PASSAGE_BOX":
      return { ...state, activePassageBoxId: action.id };
    case "SET_FEELINGS":
      return { ...state, feelings: action.feelings };
    case "SET_CUSTOM_FEELING_INPUT":
      return { ...state, customFeelingInput: action.text };
    case "SET_SUGGESTION":
      return { ...state, suggestion: action.suggestion };
    case "BUMP_TRY_COUNT":
      return { ...state, suggestionTryCount: state.suggestionTryCount + 1 };
    case "APPLY_HEX_TO_SUGGESTION": {
      if (!state.suggestion) return state;
      return {
        ...state,
        suggestion: applyHexToSuggested(
          state.suggestion,
          action.hex,
          action.naming,
        ),
      };
    }
    case "SET_SUGGESTION_CUSTOM_NAME": {
      if (!state.suggestion) return state;
      const name = action.name?.trim();
      return {
        ...state,
        suggestion: {
          ...state.suggestion,
          customColorName: name || undefined,
          nameSource: name ? "user" : "local",
        },
      };
    }
    case "CLEAR_SUGGESTION_CUSTOM_NAME": {
      if (!state.suggestion) return state;
      return {
        ...state,
        suggestion: { ...state.suggestion, customColorName: undefined },
      };
    }
    case "USE_SUGGESTION_AS_BACKGROUND": {
      if (!state.suggestion) return state;
      const raw = state.suggestion.hex;
      const rendered = renderBg(raw, state.pdfSettings.backgroundIntensity);
      return { ...state, rawBackgroundHex: raw, renderedBackgroundHex: rendered };
    }
    case "SET_RAW_BACKGROUND": {
      const raw = action.hex;
      return {
        ...state,
        rawBackgroundHex: raw,
        renderedBackgroundHex: renderBg(raw, state.pdfSettings.backgroundIntensity),
      };
    }
    case "SET_PDF_SETTINGS": {
      const pdfSettings = { ...state.pdfSettings, ...action.patch };
      const rendered =
        state.rawBackgroundHex != null
          ? renderBg(state.rawBackgroundHex, pdfSettings.backgroundIntensity)
          : state.renderedBackgroundHex;
      return { ...state, pdfSettings, renderedBackgroundHex: rendered };
    }
    case "SAVE_PALETTE": {
      const id = crypto.randomUUID();
      const palette = {
        id,
        name: action.name.trim() || "Untitled palette",
        letters: state.letters.map((l) => ({ ...l })),
        updatedAt: Date.now(),
      };
      const persistence: StudioPersistence = {
        ...state.persistence,
        palettes: [...state.persistence.palettes, palette],
      };
      return { ...state, persistence };
    }
    case "LOAD_PALETTE": {
      const p = state.persistence.palettes.find((x) => x.id === action.id);
      if (!p) return state;
      return { ...state, letters: p.letters.map((l) => ({ ...l })) };
    }
    case "DELETE_PALETTE": {
      return {
        ...state,
        persistence: {
          ...state.persistence,
          palettes: state.persistence.palettes.filter((x) => x.id !== action.id),
        },
      };
    }
    case "SET_ACTIVE_PROFILE":
      return {
        ...state,
        persistence: { ...state.persistence, activeProfileId: action.id },
      };
    case "UPSERT_PROFILE": {
      const profiles = [...state.persistence.profiles];
      const i = profiles.findIndex((p) => p.id === action.profile.id);
      if (i >= 0) profiles[i] = action.profile;
      else profiles.push(action.profile);
      return { ...state, persistence: { ...state.persistence, profiles } };
    }
    case "ADD_PROFILE": {
      const profile: UserProfile = {
        id: crypto.randomUUID(),
        displayName: action.displayName.trim() || "New profile",
      };
      return {
        ...state,
        persistence: {
          ...state.persistence,
          profiles: [...state.persistence.profiles, profile],
          activeProfileId: profile.id,
        },
      };
    }
    case "SET_BYO_HANDOFF_NAME":
      return { ...state, byoHandoffName: action.name };
    case "SET_LAB_PROFILE_ID":
      return { ...state, labProfileId: action.id };
    default:
      return state;
  }
}

function initialState(): StudioState {
  const firstBox = createPassageTextBox();
  return {
    tab: "letters",
    letters: defaultLetters(),
    passageBoxes: [firstBox],
    activePassageBoxId: firstBox.id,
    feelings: [],
    customFeelingInput: "",
    suggestion: null,
    suggestionTryCount: 0,
    rawBackgroundHex: null,
    renderedBackgroundHex: null,
    pdfSettings: defaultPdfSettings,
    persistence: BOOTSTRAP_PERSISTENCE,
    hydrated: false,
    byoHandoffName: null,
    labProfileId: null,
  };
}

type StudioCtx = {
  state: StudioState;
  dispatch: React.Dispatch<Action>;
  applyLetterHex: (index: number, hex: string, naming?: "local" | "api") => void;
  setLetterCustomName: (index: number, name: string | undefined) => void;
};

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({
  children,
  byoProfileId = null,
  byoDisplayName = null,
}: {
  children: React.ReactNode;
  byoProfileId?: string | null;
  byoDisplayName?: string | null;
}) {
  const [state, dispatch] = useReducer(studioReducer, undefined, initialState);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let persistence = loadPersistence();
      if (!persistence) {
        persistence = emptyPersistence();
        savePersistence(persistence);
      }

      if (byoProfileId) {
        const fetched = await fetchByoHandoffFromProfile(byoProfileId);
        if (cancelled) return;
        if (fetched) {
          const label =
            byoDisplayName?.trim() ||
            fetched.payload.name?.trim() ||
            "Build Your Own";
          await prewarmLetterMasksAsync();
          if (cancelled) return;
          dispatch({
            type: "HYDRATE",
            letters: fetched.letters,
            persistence,
          });
          dispatch({
            type: "UPSERT_PROFILE",
            profile: { id: byoProfileId, displayName: label },
          });
          dispatch({ type: "SET_ACTIVE_PROFILE", id: byoProfileId });
          dispatch({ type: "SET_BYO_HANDOFF_NAME", name: label });
          dispatch({ type: "SET_LAB_PROFILE_ID", id: byoProfileId });
          dispatch({ type: "SET_TAB", tab: "letters" });
          return;
        }
      }

      const letters = loadLetters();
      if (cancelled) return;
      await prewarmLetterMasksAsync();
      if (cancelled) return;
      dispatch({
        type: "HYDRATE",
        letters: letters ?? undefined,
        persistence,
      });
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [byoProfileId, byoDisplayName]);

  useEffect(() => {
    if (!state.hydrated) return;
    saveLetters(state.letters);
  }, [state.letters, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated) return;
    savePersistence(state.persistence);
  }, [state.persistence, state.hydrated]);

  const applyLetterHex = useCallback(
    (index: number, hex: string, naming?: "local" | "api") => {
      const prev = state.letters[index];
      if (!prev) return;
      try {
        const next = applyHexToLetterColor(prev, hex, naming);
        dispatch({ type: "UPDATE_LETTER", index, letter: next });
      } catch {
        /* invalid hex */
      }
    },
    [state.letters],
  );

  const setLetterCustomName = useCallback((index: number, name: string | undefined) => {
    const prev = state.letters[index];
    if (!prev) return;
    const trimmed = name?.trim();
    dispatch({
      type: "UPDATE_LETTER",
      index,
      letter: {
        ...prev,
        customColorName: trimmed || undefined,
        nameSource: trimmed ? "user" : prev.nameSource,
      },
    });
  }, [state.letters]);

  const value = useMemo(
    () => ({ state, dispatch, applyLetterHex, setLetterCustomName }),
    [state, applyLetterHex, setLetterCustomName],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio() {
  const x = useContext(Ctx);
  if (!x) throw new Error("useStudio requires StudioProvider");
  return x;
}
