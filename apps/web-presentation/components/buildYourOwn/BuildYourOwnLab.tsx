"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

import { annotateWordLetterStyle } from "@/lib/annotateCharColors";
import {
  BYO_DEFAULT_EFFECT_PREVIEW_SENTENCE,
  effectPreviewSentenceForCoverageWord,
} from "@/lib/buildYourOwn/effectPreviewSentences";
import {
  buildLetterOverrideFromLab,
  coverageDraftToManualPayload,
  mergeLivePreviewTokens,
} from "@/lib/buildYourOwn/liveEffectPreview";
import {
  COVERAGE_WORD_BACKGROUND,
  coverageWordLetterHexes,
  farthestBackgroundForLetterColors,
  COVERAGE_DEFAULT_PXS,
} from "@/lib/buildYourOwn/wordContrastBackground";
import { navigateToColorStudio } from "@/lib/colorStudioHandoff";
import { cssFontFamily, passageFontWeight } from "@/lib/colorStudio/passageFonts";
import { passageContrastRimStyle } from "@/lib/colorStudio/passageContrastRim";
import { clampLab, hexToLab, labToHex } from "@/lib/labColor";
import type { LightGlyphCss } from "@/lib/pxsVisual";

import { ByoChromaStack, AB_RANGE } from "./ByoChromaStack";
import { OrbitSegmentRing, type CenterWordSlot } from "./OrbitSegmentRing";
import { WordCoverageAnnotator } from "./WordCoverageAnnotator";

/** 7-char hex for LAB / glyph math (strips alpha suffix). */
function hexCoreForLab(h: string): string {
  const x = h.startsWith("#") ? h : `#${h}`;
  if (x.length >= 7) return x.slice(0, 7);
  return "#57534e";
}

type LetterEntry = {
  annotated: boolean;
  color: string;
  locked: boolean;
  revision_count: number;
  stability: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  /** Model space [0,1], English SegmentInput.prominence */
  prominence?: number;
  /** Model space [0,1], English SegmentInput.spread */
  spread?: number;
};

function initialLetterPxS(): Record<string, { p: number; s: number }> {
  const o: Record<string, { p: number; s: number }> = {};
  for (let i = 0; i < 26; i++) o[String.fromCharCode(97 + i)] = { p: 0.62, s: 0.38 };
  return o;
}

const BYO_LETTER_MODEL_LS = "synglyph-byo-lab-letter-model";

function persistLetterModelCache(profileId: string, letters: Record<string, LetterEntry>) {
  try {
    const o: Record<string, { prominence: number; spread: number }> = {};
    for (const k of Object.keys(letters)) {
      const r = letters[k];
      if (!r) continue;
      o[k] = { prominence: r.prominence ?? 0.62, spread: r.spread ?? 0.38 };
    }
    localStorage.setItem(`${BYO_LETTER_MODEL_LS}:${profileId}`, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function readLetterModelCache(profileId: string): Record<string, { prominence: number; spread: number }> | null {
  try {
    const raw = localStorage.getItem(`${BYO_LETTER_MODEL_LS}:${profileId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { prominence: number; spread: number }>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function lettersPxSFromProfile(
  letters: Record<string, LetterEntry>,
  profileId: string,
): Record<string, { p: number; s: number }> {
  const cache = readLetterModelCache(profileId);
  const next: Record<string, { p: number; s: number }> = {};
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(97 + i);
    const row = letters[c];
    let prom = row?.prominence;
    let spr = row?.spread;
    if ((prom === undefined || spr === undefined) && cache?.[c]) {
      prom = cache[c]!.prominence;
      spr = cache[c]!.spread;
    }
    prom = prom ?? 0.62;
    spr = spr ?? 0.38;
    next[c] = { p: prom, s: spr };
  }
  return next;
}

const DEFAULT_PICKER_PXS = { p: 0.62, s: 0.38 };

const SESSION_KEY = "synglyph-byo-session";

const SHOW_CV_PANEL = process.env.NEXT_PUBLIC_LAB_SHOW_CV !== "0";

function isCoveragePhase(phase: string | undefined): boolean {
  return phase === "coverage" || phase === "coverage_anchor" || phase === "coverage_assist";
}

type SessionMeta = { profileId: string; displayName: string; slug: string };

type ProfileState = {
  profile_id: string;
  display_name: string;
  slug: string;
  /** "lite" = letters → free_text; "deep" = full flow */
  track?: string;
  /** When set, the 30 coverage words came from this KB vocab at profile creation. */
  coverage_kb_vocab_version_id?: string | null;
  coverage_kb_label?: string | null;
  palette_history: {
    letter?: string;
    hex?: string;
    lab_l?: number;
    lab_a?: number;
    lab_b?: number;
    saved_at?: string;
  }[];
  phase: string;
  manifest_version?: number;
  seed?: number;
  training_status: string;
  interruption_state: string;
  letters_order: string[];
  coverage_words: string[];
  coverage_anchor_words?: string[];
  coverage_assist_words?: string[];
  checks: { id: string; word: string }[];
  letters: Record<string, LetterEntry>;
  coverage: {
    word: string;
    completed: boolean;
    accepted_prediction: boolean;
    coverage_tier?: string;
    manual_adjustments?: {
      letters?: Array<{
        index?: number;
        char: string;
        color: string;
        prominence?: number;
        spread?: number;
      }>;
      boundary_influence?: number[];
    };
  }[];
  evaluation_checks: { id: string; word: string; status: string }[];
  progress: {
    letters_anchored_count: number;
    coverage_completed_count: number;
    checks_completed_count: number;
    overall_progress: number;
    readiness_label: string;
    anchor_completed_count?: number;
    assist_completed_count?: number;
    anchor_total?: number;
    assist_total?: number;
  };
  active_checkpoint_uri: string | null;
};

type NextTask = { type: string; id: string | null; word?: string; coverage_tier?: string };

function annotatedWordsFromProfile(profile: ProfileState): string[] {
  const completed = new Set(
    profile.coverage.filter((c) => c.completed).map((c) => c.word.toLowerCase()),
  );
  return profile.coverage_words.filter((w) => completed.has(w.toLowerCase()));
}

function coverageTierForWord(profile: ProfileState, word: string): "anchor" | "assist" | undefined {
  const wl = word.toLowerCase();
  const row = profile.coverage.find((c) => c.word.toLowerCase() === wl);
  const stored = row?.coverage_tier;
  if (stored === "anchor" || stored === "assist") return stored;
  if (profile.coverage_anchor_words?.some((w) => w.toLowerCase() === wl)) return "anchor";
  if (profile.coverage_assist_words?.some((w) => w.toLowerCase() === wl)) return "assist";
  const idx = profile.coverage_words.findIndex((w) => w.toLowerCase() === wl);
  const anchorTotal = profile.progress.anchor_total ?? profile.coverage_anchor_words?.length ?? 10;
  if (idx >= 0 && idx < anchorTotal) return "anchor";
  if (idx >= anchorTotal) return "assist";
  return undefined;
}

function isAssistCoverageWord(profile: ProfileState, word: string): boolean {
  return coverageTierForWord(profile, word) === "assist" || profile.phase === "coverage_assist";
}

type TrainRunStatus = {
  status: string;
  cv_status?: string;
  cv_summary?: Record<string, { mean?: number; std?: number }>;
  cv_folds?: Array<Record<string, unknown>>;
  holdout_metrics?: Record<string, unknown>;
};

type RenderToken = {
  text: string;
  fill: string;
  /** Model-space [0,1], salience */
  prominence?: number;
  /** Model-space [0,1], softness / halo */
  spread?: number;
  /** Model-space [0,1], transition strength after this grapheme (before next) */
  boundary_after?: number;
};

type RenderPayload = {
  render_version: string;
  text: string;
  tokens: RenderToken[];
  provenance?: { kind?: string };
};

/** P=prominence, S=spread, boundary_after — grouped per word so lines break between words only. */
function ReadingPreviewTokens({
  tokens,
  className,
  backgroundHex = "#FFFFFF",
  thinPassageFont = false,
}: {
  tokens: RenderToken[];
  className?: string;
  /** Passage/card background for low-contrast letter rim. */
  backgroundHex?: string;
  /** Raleway-style preview: keep weight light; prominence mostly affects glow. */
  thinPassageFont?: boolean;
}) {
  if (!tokens.length) return null;

  const parts: ReactNode[] = [];
  let i = 0;
  let seq = 0;

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/^\s+$/.test(t.text)) {
      let ws = "";
      while (i < tokens.length && /^\s+$/.test(tokens[i]!.text)) {
        ws += tokens[i]!.text;
        i++;
      }
      parts.push(
        <span
          key={`sp-${seq++}`}
          className="inline-block whitespace-pre align-baseline mx-[0.2em]"
        >
          {ws}
        </span>,
      );
      continue;
    }

    const wordStart = i;
    const wordSlots: { tok: RenderToken; idx: number }[] = [];
    while (i < tokens.length && !/^\s+$/.test(tokens[i]!.text)) {
      wordSlots.push({ tok: tokens[i]!, idx: i });
      i++;
    }

    parts.push(
      <span key={`wd-${wordStart}`} className="inline-block whitespace-nowrap align-baseline">
        {wordSlots.map(({ tok, idx }, j) => {
          const p = tok.prominence ?? 0.62;
          const s = tok.spread ?? 0.38;
          const fw = thinPassageFont
            ? Math.round(EFFECT_PREVIEW_BASE_WEIGHT + Math.max(0, Math.min(1, p)) * 80)
            : Math.round(300 + Math.max(0, Math.min(1, p)) * 175);
          const blur = 1.5 + Math.max(0, Math.min(1, s)) * 14;
          const glow = `0 0 ${blur}px ${tok.fill}aa, 0 0 ${blur * 1.25}px ${tok.fill}55`;
          const hasNextInWord = j < wordSlots.length - 1;
          const bAfter = tok.boundary_after;
          const rim = passageContrastRimStyle(tok.fill, backgroundHex);
          return (
            <span
              key={idx}
              className="inline-block align-baseline"
              style={{
                color: tok.fill,
                fontWeight: fw,
                textShadow: glow,
                marginRight:
                  hasNextInWord && bAfter !== undefined
                    ? `${0.02 + Math.max(0, Math.min(1, bAfter)) * 0.32}em`
                    : undefined,
                ...rim,
              }}
            >
              {tok.text}
            </span>
          );
        })}
      </span>,
    );
  }

  return <span className={className}>{parts}</span>;
}

async function labFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new Error(
      "Cannot reach the SynGlyph API. Start the backend on port 8000, then refresh this page.",
    );
  }
  if (!r.ok) {
    const t = await r.text();
    if (r.status >= 500 && (!t || t === "Internal Server Error")) {
      throw new Error(
        "SynGlyph API error — is the backend running on port 8000? Check the API terminal for details.",
      );
    }
    try {
      const parsed = JSON.parse(t) as { detail?: string | { msg?: string }[] };
      const d = parsed.detail;
      if (typeof d === "string" && d.trim()) {
        throw new Error(d);
      }
      if (Array.isArray(d) && d[0]?.msg) {
        throw new Error(String(d[0].msg));
      }
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) {
        throw e;
      }
    }
    throw new Error(t.trim() || r.statusText);
  }
  return r.json() as Promise<T>;
}

/** Build-your-own lab theme */
const BYO_BG = "#FFF8E7";
const BYO_TEXT = "#002FA7";
const EFFECT_PREVIEW_FONT = cssFontFamily("Raleway");
const EFFECT_PREVIEW_BASE_WEIGHT = passageFontWeight("Raleway");

/** Adjacent character pairs in a word (same notion as backend `covered_patterns` bigrams). */
function wordPairPatterns(w: string): string[] {
  const low = w.toLowerCase();
  const out: string[] = [];
  for (let i = 0; i < low.length - 1; i++) out.push(low.slice(i, i + 2));
  return out;
}

function ByoWorkflowStepper({
  phase,
  lettersAnchored,
  wordsSaved: _wordsSaved,
  checksDone: _checksDone,
  ink,
  track,
}: {
  phase: string;
  lettersAnchored: number;
  wordsSaved: number;
  checksDone: number;
  ink: string;
  track?: string;
}) {
  const isLite = track === "lite";
  const letterCap = 26;

  const step0Done = lettersAnchored >= letterCap;
  const step1Done = phase === "free_text" || phase === "create";

  const activeStep = phase === "letters" ? 0 : 1;

  const steps = isLite
    ? ([
        { key: "letters", label: "Letter anchor" },
        { key: "test", label: "Test" },
      ] as const)
    : ([
        { key: "letters", label: "Letter anchor" },
        { key: "words_checks", label: "Words & checks" },
      ] as const);

  const labelCls =
    "text-[10px] font-semibold uppercase tracking-wider leading-snug sm:text-[11px]";

  return (
    <div className="min-w-0 w-full max-w-[42rem] flex-1 basis-[min(100%,22rem)] sm:mt-0 lg:min-w-[28rem]">
      <p className={`${labelCls} opacity-55`} style={{ color: ink }}>
        Progress
      </p>
      <div className="relative mt-3 w-full px-0 sm:px-1">
        <div
          className="pointer-events-none absolute left-[8%] right-[8%] top-[5px] z-0 h-px sm:left-[6%] sm:right-[6%]"
          style={{ backgroundColor: ink }}
          aria-hidden
        />
        <ol
          className="relative z-[1] flex w-full justify-between gap-1 sm:gap-2"
          aria-label="Lab workflow steps"
        >
          {steps.map((s, i) => {
            const isCurrent = activeStep === i;
            const reached = activeStep > i;
            const done = i === 0 ? step0Done : step1Done;
            const dotFilled = isCurrent || reached || done;

            return (
              <li
                key={s.key}
                className="flex min-w-0 max-w-[13rem] flex-1 flex-col items-center px-0.5 text-center sm:px-2"
              >
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full border-2 sm:h-3 sm:w-3"
                  style={{
                    borderColor: ink,
                    backgroundColor: dotFilled ? ink : "#FFFCF3",
                    boxShadow: isCurrent ? `0 0 0 2px ${ink}22` : undefined,
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                />
                <span
                  className={`${labelCls} mt-2 w-full hyphens-auto break-words ${isCurrent ? "font-bold opacity-100" : "opacity-55"}`}
                  style={{ color: ink }}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function BuildYourOwnLab() {
  const router = useRouter();
  const [gate, setGate] = useState<"entry" | "lab">("entry");
  const [nameInput, setNameInput] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<"lite" | "deep">("deep");
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [nextTask, setNextTask] = useState<NextTask | null>(null);
  const [renderNow, setRenderNow] = useState<RenderPayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [coverageTipsOpen, setCoverageTipsOpen] = useState(false);
  const [lettersChromaTipsOpen, setLettersChromaTipsOpen] = useState(false);
  const [metainfoOpen, setMetainfoOpen] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [trainReport, setTrainReport] = useState<TrainRunStatus | null>(null);
  const [freeText, setFreeText] = useState("I want to see my own reading map.");

  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [letterPxS, setLetterPxS] = useState(initialLetterPxS);
  const [coverageSelectedIndex, setCoverageSelectedIndex] = useState<number | null>(null);
  const [coverageLabPickerIndex, setCoverageLabPickerIndex] = useState<number | null>(null);
  const [coverageIndexHex, setCoverageIndexHex] = useState<Record<number, string>>({});
  const [coverageIndexPxS, setCoverageIndexPxS] = useState<Record<number, { prominence: number; spread: number }>>({});
  const [covBoundary, setCovBoundary] = useState<number[]>([]);
  const [coverageUseContrastBg, setCoverageUseContrastBg] = useState(false);
  const [coverageCanvasBgHex, setCoverageCanvasBgHex] = useState<Record<number, string>>({});
  const [coveragePredictionStatus, setCoveragePredictionStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [coveragePredictionSummary, setCoveragePredictionSummary] = useState<string | null>(null);
  const [annotatedWordsOpen, setAnnotatedWordsOpen] = useState(false);
  const pxPatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeTextPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annotatedWordsRef = useRef<HTMLDivElement>(null);

  const [labL, setLabL] = useState(58);
  const [labA, setLabA] = useState(12);
  const [labB, setLabB] = useState(-32);

  const planeRef = useRef<HTMLDivElement>(null);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragPlane = useRef(false);
  const labLPlaneRef = useRef(labL);
  labLPlaneRef.current = labL;

  const loadSessionFromStorage = (): SessionMeta | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw) as SessionMeta;
      if (o?.profileId && o?.displayName && o?.slug) return o;
    } catch {
      /* ignore */
    }
    return null;
  };

  const persistSession = (s: SessionMeta) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  };

  const refreshEffectPreview = useCallback(
    async (
      pid: string,
      text: string,
      live?: {
        letter_overrides?: Record<string, Record<string, number | string>>;
        coverage_live_draft?: { word: string; manual_adjustments: Record<string, unknown> };
      },
    ) => {
      const prev = await labFetch<RenderPayload>("/api/lab/preview", {
        method: "POST",
        body: JSON.stringify({
          profile_id: pid,
          mode: "default_sentence",
          comparison_mode: "now",
          text,
          ...(live?.letter_overrides ? { letter_overrides: live.letter_overrides } : {}),
          ...(live?.coverage_live_draft ? { coverage_live_draft: live.coverage_live_draft } : {}),
        }),
      });
      setRenderNow(prev);
    },
    [],
  );

  const loadState = useCallback(async (pid: string) => {
    const data = await labFetch<{ profile: ProfileState; next_task: NextTask }>(
      `/api/lab/profile/state?profile_id=${encodeURIComponent(pid)}`,
    );
    setProfile(data.profile);
    setLetterPxS(lettersPxSFromProfile(data.profile.letters, data.profile.profile_id));
    persistLetterModelCache(data.profile.profile_id, data.profile.letters);
    setNextTask(data.next_task);
    const meta: SessionMeta = {
      profileId: data.profile.profile_id,
      displayName: data.profile.display_name || "You",
      slug: data.profile.slug || pid.slice(0, 8),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    setSession(meta);
    const previewText =
      data.next_task?.type === "coverage_word" && data.next_task.id
        ? effectPreviewSentenceForCoverageWord(
            String(data.next_task.id),
            data.profile.coverage_words,
            data.profile.seed ?? 0,
          )
        : BYO_DEFAULT_EFFECT_PREVIEW_SENTENCE;
    await refreshEffectPreview(pid, previewText);
    return { phase: data.profile.phase, next_task: data.next_task };
  }, [refreshEffectPreview]);

  useEffect(() => {
    const s = loadSessionFromStorage();
    if (s) setSession(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lab/health")
      .then((r) => {
        if (!cancelled) setApiOnline(r.ok);
      })
      .catch(() => {
        if (!cancelled) setApiOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  /** Live reading map for free_text: debounced preview from model + P/S/boundary mapping. */
  useEffect(() => {
    if (!session?.profileId || profile?.phase !== "free_text") return;
    if (freeTextPreviewTimer.current) clearTimeout(freeTextPreviewTimer.current);
    freeTextPreviewTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const prev = await labFetch<RenderPayload>("/api/lab/preview", {
            method: "POST",
            body: JSON.stringify({
              profile_id: session.profileId,
              mode: "free_text",
              text: freeText,
            }),
          });
          setRenderNow(prev);
        } catch {
          /* ignore */
        }
      })();
    }, 450);
    return () => {
      if (freeTextPreviewTimer.current) clearTimeout(freeTextPreviewTimer.current);
    };
  }, [freeText, session?.profileId, profile?.phase]);

  const task = nextTask;
  const annotatedCoverageWords = useMemo(
    () => (profile ? annotatedWordsFromProfile(profile) : []),
    [profile],
  );

  const goToCoverageWord = useCallback(
    (word: string) => {
      if (!profile) return;
      setNextTask({
        type: "coverage_word",
        id: word,
        coverage_tier: coverageTierForWord(profile, word),
      });
      setAnnotatedWordsOpen(false);
      requestAnimationFrame(() => {
        document.getElementById("byo-coverage-word")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [profile],
  );

  useEffect(() => {
    if (!annotatedWordsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (annotatedWordsRef.current?.contains(e.target as Node)) return;
      setAnnotatedWordsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [annotatedWordsOpen]);

  const effectiveLetter = useMemo(() => {
    if (profile?.phase === "letters") {
      if (selectedLetter) return selectedLetter.toLowerCase();
      if (task?.type === "letter" && task.id) return String(task.id).toLowerCase();
    }
    if (
      isCoveragePhase(profile?.phase) &&
      task?.type === "coverage_word" &&
      task.id &&
      coverageSelectedIndex !== null
    ) {
      const w = String(task.id);
      const ch = w[coverageSelectedIndex];
      if (ch && /[a-z]/i.test(ch)) return ch.toLowerCase();
    }
    return null;
  }, [profile?.phase, selectedLetter, task, coverageSelectedIndex]);

  /** Effect preview sentence (rotates per coverage word). */
  const effectPreviewText = useMemo(() => {
    if (!profile) return BYO_DEFAULT_EFFECT_PREVIEW_SENTENCE;
    if (task?.type === "coverage_word" && task.id) {
      return effectPreviewSentenceForCoverageWord(
        String(task.id),
        profile.coverage_words,
        profile.seed ?? 0,
      );
    }
    return BYO_DEFAULT_EFFECT_PREVIEW_SENTENCE;
  }, [profile, task?.type, task?.id, profile?.coverage_words, profile?.seed]);

  const liveLetterOverrides = useMemo(() => {
    if (!profile || !effectiveLetter) return undefined;
    const ch = effectiveLetter.toLowerCase();
    const inLetters = profile.phase === "letters";
    const inCoverageLab =
      isCoveragePhase(profile.phase) &&
      task?.type === "coverage_word" &&
      coverageLabPickerIndex !== null;
    if (!inLetters && !inCoverageLab) return undefined;
    let prominence = profile.letters[ch]?.prominence ?? 0.62;
    let spread = profile.letters[ch]?.spread ?? 0.38;
    if (inLetters) {
      const ps = letterPxS[ch];
      prominence = ps?.p ?? prominence;
      spread = ps?.s ?? spread;
    } else if (coverageSelectedIndex !== null) {
      const ps = coverageIndexPxS[coverageSelectedIndex];
      if (ps) {
        prominence = ps.prominence;
        spread = ps.spread;
      }
    }
    return buildLetterOverrideFromLab(ch, labL, labA, labB, prominence, spread);
  }, [
    profile,
    effectiveLetter,
    profile?.phase,
    task?.type,
    coverageLabPickerIndex,
    coverageSelectedIndex,
    coverageIndexPxS,
    labL,
    labA,
    labB,
    letterPxS,
  ]);

  const liveCoverageWordDraft = useMemo(() => {
    if (!profile || !isCoveragePhase(profile.phase) || task?.type !== "coverage_word" || !task.id) {
      return undefined;
    }
    return {
      word: String(task.id),
      indexHex: coverageIndexHex,
      indexPxS: coverageIndexPxS,
      boundary: covBoundary,
    };
  }, [profile, task?.type, task?.id, coverageIndexHex, coverageIndexPxS, covBoundary]);

  /** Effect preview: model tokens + instant local edits while dragging. */
  const displayEffectPreviewTokens = useMemo(() => {
    if (!profile || profile.phase === "free_text" || profile.phase === "create") {
      return renderNow?.tokens ?? null;
    }
    const base = renderNow?.text === effectPreviewText ? renderNow.tokens : null;
    return mergeLivePreviewTokens(base, effectPreviewText, profile.letters, {
      letterOverrides: liveLetterOverrides,
      wordDraft: liveCoverageWordDraft,
    });
  }, [
    profile,
    renderNow?.text,
    renderNow?.tokens,
    effectPreviewText,
    liveLetterOverrides,
    liveCoverageWordDraft,
  ]);

  /** Debounced model preview: n-gram lexicon + draft word + letter overrides. */
  useEffect(() => {
    if (!session?.profileId || !profile) return;
    if (profile.phase === "free_text" || profile.phase === "create") return;
    if (effectPreviewTimer.current) clearTimeout(effectPreviewTimer.current);
    effectPreviewTimer.current = setTimeout(() => {
      const live: {
        letter_overrides?: Record<string, Record<string, number | string>>;
        coverage_live_draft?: { word: string; manual_adjustments: Record<string, unknown> };
      } = {};
      if (liveLetterOverrides && Object.keys(liveLetterOverrides).length > 0) {
        live.letter_overrides = liveLetterOverrides as Record<string, Record<string, number | string>>;
      }
      if (liveCoverageWordDraft && profile) {
        live.coverage_live_draft = coverageDraftToManualPayload(
          liveCoverageWordDraft.word,
          liveCoverageWordDraft.indexHex,
          liveCoverageWordDraft.indexPxS,
          liveCoverageWordDraft.boundary ?? [],
          profile.letters,
        );
      }
      void refreshEffectPreview(
        session.profileId,
        effectPreviewText,
        Object.keys(live).length > 0 ? live : undefined,
      ).catch(() => {
        /* keep client preview */
      });
    }, 380);
    return () => {
      if (effectPreviewTimer.current) clearTimeout(effectPreviewTimer.current);
    };
  }, [
    session?.profileId,
    profile,
    profile?.phase,
    effectPreviewText,
    liveLetterOverrides,
    liveCoverageWordDraft,
    refreshEffectPreview,
  ]);

  useEffect(() => {
    if (!profile || !effectiveLetter) return;
    if (isCoveragePhase(profile.phase) && coverageSelectedIndex !== null && task?.id) {
      const hx = coverageIndexHex[coverageSelectedIndex];
      const row = profile.letters[effectiveLetter];
      const col = hx ?? row?.color ?? "#4a5dff";
      try {
        const t = hexToLab(hexCoreForLab(col).replace("#", ""));
        const c = clampLab(t.L, t.a, t.b);
        setLabL(c.L);
        setLabA(c.a);
        setLabB(c.b);
      } catch {
        /* keep */
      }
      return;
    }
    const row = profile.letters[effectiveLetter];
    if (!row) return;
    const { L, a, b } = clampLab(row.lab_l ?? 58, row.lab_a ?? 0, row.lab_b ?? 0);
    setLabL(L);
    setLabA(a);
    setLabB(b);
  }, [profile, effectiveLetter, profile?.phase, coverageSelectedIndex, coverageIndexHex, task?.id]);

  useEffect(() => {
    if (profile?.phase !== "letters" || task?.type !== "letter" || !task.id) return;
    setSelectedLetter(String(task.id).toLowerCase());
  }, [profile?.phase, task?.id, task?.type]);

  useEffect(() => {
    if (!profile || !isCoveragePhase(profile.phase) || task?.type !== "coverage_word" || !task.id) return;
    setCoverageLabPickerIndex(null);
    const w = String(task.id);
    const L = w.length;
    const b = Array.from({ length: Math.max(0, L - 1) }, () => 0.5);
    const row = profile.coverage.find((c) => c.word.toLowerCase() === w.toLowerCase());
    const manual = row?.manual_adjustments;
    const bi = manual?.boundary_influence;
    if (Array.isArray(bi)) {
      for (let i = 0; i < bi.length && i < b.length; i++) {
        const v = bi[i];
        if (typeof v === "number" && Number.isFinite(v)) b[i] = Math.max(0, Math.min(1, v));
      }
    }
    setCovBoundary(b);
    setCoverageUseContrastBg(false);
    setCoverageCanvasBgHex({});
    setCoveragePredictionStatus("idle");
    setCoveragePredictionSummary(null);
    const hx: Record<number, string> = {};
    const px: Record<number, { prominence: number; spread: number }> = {};
    const letters = manual?.letters;
    const hasIndexed = Array.isArray(letters) && letters.some((e) => e && typeof e.index === "number");
    if (Array.isArray(letters)) {
      if (hasIndexed) {
        for (const ent of letters) {
          if (!ent || typeof ent.index !== "number") continue;
          const ix = ent.index;
          if (ix < 0 || ix >= L) continue;
          if (ent.color) hx[ix] = ent.color.startsWith("#") ? ent.color : `#${ent.color}`;
          if (typeof ent.prominence === "number" && typeof ent.spread === "number") {
            px[ix] = { prominence: ent.prominence, spread: ent.spread };
          }
        }
      } else {
        const letterEnts = letters.filter((e) => e?.char);
        let eIdx = 0;
        for (let i = 0; i < L; i++) {
          const c = w[i];
          if (!c || !/[a-z]/i.test(c)) continue;
          const ent = letterEnts[eIdx];
          eIdx += 1;
          if (!ent) break;
          if (ent.char?.toLowerCase() !== c.toLowerCase()) continue;
          if (ent.color) hx[i] = ent.color.startsWith("#") ? ent.color : `#${ent.color}`;
          if (typeof ent.prominence === "number" && typeof ent.spread === "number") {
            px[i] = { prominence: ent.prominence, spread: ent.spread };
          }
        }
      }
    }
    const first = [...w].findIndex((c) => /[a-z]/i.test(c));
    const hasManualColors = Object.keys(hx).length > 0;
    if (hasManualColors) {
      setCoverageIndexHex(hx);
      setCoverageIndexPxS(px);
      setCoverageSelectedIndex(first >= 0 ? first : null);
    } else {
      const isAssist = isAssistCoverageWord(profile, w);
      if (!isAssist) {
        const hxAnchor: Record<number, string> = {};
        const pxAnchor: Record<number, { prominence: number; spread: number }> = {};
        for (let i = 0; i < L; i++) {
          const c = w[i];
          if (!c || !/[a-z]/i.test(c)) continue;
          const row = profile.letters[c.toLowerCase()];
          if (row?.color) {
            hxAnchor[i] = row.color.startsWith("#") ? row.color : `#${row.color}`;
          }
          pxAnchor[i] = { ...COVERAGE_DEFAULT_PXS };
        }
        setCoverageIndexHex(hxAnchor);
        setCoverageIndexPxS(pxAnchor);
        setCoverageSelectedIndex(first >= 0 ? first : null);
        return;
      }
      // Assist — pre-fill from n-gram / model prediction.
      setCoverageIndexHex({});
      setCoverageIndexPxS({});
      setCoverageSelectedIndex(first >= 0 ? first : null);
      setCoveragePredictionStatus("loading");
      setCoveragePredictionSummary(null);
      let cancelled = false;
      labFetch<{
        letters: { index: number; hex: string; prominence: number; spread: number }[];
        boundary?: { left: number; right: number; boundary_after: number }[];
        provenance?: {
          kind?: string;
          ngram_hits?: string[];
          model_gaps?: number[];
          model_unavailable?: boolean;
          model_filled_gaps?: number;
          checkpoint?: string;
        };
      }>("/api/lab/predict_word", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profile.profile_id,
          word: w,
          mode: "ngram_compose",
        }),
      })
        .then((out) => {
          if (cancelled) return;
          const predHx: Record<number, string> = {};
          const predPx: Record<number, { prominence: number; spread: number }> = {};
          let charIdx = 0;
          for (let i = 0; i < w.length; i++) {
            if (!/[a-z]/i.test(w[i] ?? "")) continue;
            const entry = out.letters[charIdx];
            if (entry) {
              predHx[i] = entry.hex;
              predPx[i] = { prominence: entry.prominence, spread: entry.spread };
            }
            charIdx++;
          }
          setCoverageIndexHex(predHx);
          setCoverageIndexPxS(predPx);
          if (Array.isArray(out.boundary) && out.boundary.length > 0) {
            const alphaIdx: number[] = [];
            for (let i = 0; i < w.length; i++) {
              if (/[a-z]/i.test(w[i] ?? "")) alphaIdx.push(i);
            }
            const nextB = Array.from({ length: Math.max(0, w.length - 1) }, () => 0.5);
            for (const ent of out.boundary) {
              const leftAlpha = ent.left;
              if (leftAlpha < 0 || leftAlpha >= alphaIdx.length - 1) continue;
              const wordIdx = alphaIdx[leftAlpha];
              if (wordIdx !== undefined && wordIdx < nextB.length) {
                nextB[wordIdx] = Math.max(0, Math.min(1, ent.boundary_after));
              }
            }
            setCovBoundary(nextB);
          }
          const hits = out.provenance?.ngram_hits?.length ?? 0;
          const gaps = out.provenance?.model_gaps?.length ?? 0;
          const kind = out.provenance?.kind ?? "prediction";
          const modelUnavailable = out.provenance?.model_unavailable;
          const modelFilled = out.provenance?.model_filled_gaps ?? 0;
          if (kind === "ngram_then_model" && modelFilled > 0) {
            setCoveragePredictionSummary(
              `Model suggestion: ${hits} n-gram pattern${hits === 1 ? "" : "s"} from your first 10 words; BiLSTM filled ${modelFilled} remaining letter${modelFilled === 1 ? "" : "s"}.`,
            );
          } else if (hits > 0 && gaps > 0 && modelUnavailable) {
            setCoveragePredictionSummary(
              `Partial match: ${hits} pattern${hits === 1 ? "" : "s"} from your first 10 words (${out.provenance?.ngram_hits?.join(", ") ?? ""}). Remaining letters use letter colors at P0/S0 — no word model on this server yet.`,
            );
          } else if (hits > 0 && gaps > 0) {
            setCoveragePredictionSummary(
              `Model suggestion: ${hits} n-gram pattern${hits === 1 ? "" : "s"} from your first 10 words; ${gaps} letter${gaps === 1 ? "" : "s"} still need model fill.`,
            );
          } else if (hits > 0) {
            setCoveragePredictionSummary(
              `Model suggestion: assembled from ${hits} n-gram pattern${hits === 1 ? "" : "s"} you annotated.`,
            );
          } else if (kind === "ngram_then_model" || kind === "trainer_rebase") {
            setCoveragePredictionSummary("Model suggestion: BiLSTM word prediction using your letter palette.");
          } else if (modelUnavailable) {
            setCoveragePredictionSummary(
              "No matching n-grams yet — showing letter colors at P0/S0. Save more anchor words or enable lab training for full word prediction.",
            );
          } else {
            setCoveragePredictionSummary(
              "Model suggestion prefilled — edit if needed, then Accept prediction or Save word.",
            );
          }
          setCoveragePredictionStatus("ready");
        })
        .catch((e) => {
          if (cancelled) return;
          setCoveragePredictionStatus("error");
          setCoveragePredictionSummary(null);
          setToast(e instanceof Error ? e.message : "Prediction failed");
        });
      return () => {
        cancelled = true;
      };
    }
  }, [profile?.phase, profile?.coverage, profile?.profile_id, task?.id, task?.type, task?.coverage_tier]);

  const patchLetterPxS = useCallback(
    async (char: string, pDisplay: number, sDisplay: number) => {
      if (!session) return;
      const prominence = Math.max(0, Math.min(1, pDisplay));
      const spread = Math.max(0, Math.min(1, sDisplay));
      const res = await labFetch<{
        updated_letter: { char: string; prominence: number; spread: number; revision_count: number; annotated: boolean };
      }>(`/api/lab/letters/${encodeURIComponent(char)}`, {
        method: "PATCH",
        body: JSON.stringify({ profile_id: session.profileId, prominence, spread }),
      });
      setProfile((prev) => {
        if (!prev) return prev;
        const row = prev.letters[char];
        if (!row) return prev;
        const letters = {
          ...prev.letters,
          [char]: {
            ...row,
            prominence: res.updated_letter.prominence,
            spread: res.updated_letter.spread,
          },
        };
        persistLetterModelCache(prev.profile_id, letters);
        return { ...prev, letters };
      });
    },
    [session],
  );

  useEffect(() => {
    if (!session || !profile || !effectiveLetter) return;
    if (profile.phase !== "letters") return;
    const ps = letterPxS[effectiveLetter];
    if (!ps) return;
    const row = profile.letters[effectiveLetter];
    const serverP = row?.prominence ?? 0.62;
    const serverS = row?.spread ?? 0.38;
    if (Math.abs(ps.p - serverP) < 1e-4 && Math.abs(ps.s - serverS) < 1e-4) return;
    if (pxPatchTimer.current) clearTimeout(pxPatchTimer.current);
    pxPatchTimer.current = setTimeout(() => {
      pxPatchTimer.current = null;
      void patchLetterPxS(effectiveLetter, ps.p, ps.s).catch(() => {
        /* offline: values stay in UI; local cache updates on next successful load */
      });
    }, 420);
    return () => {
      if (pxPatchTimer.current) clearTimeout(pxPatchTimer.current);
    };
  }, [
    letterPxS,
    effectiveLetter,
    session?.profileId,
    profile?.letters[effectiveLetter ?? ""]?.prominence,
    profile?.letters[effectiveLetter ?? ""]?.spread,
    patchLetterPxS,
    profile?.phase,
  ]);

  const prevEffectiveLetterRef = useRef<string | null>(null);
  useEffect(() => {
    if (profile?.phase !== "letters") {
      prevEffectiveLetterRef.current = effectiveLetter;
      return;
    }
    const prev = prevEffectiveLetterRef.current;
    prevEffectiveLetterRef.current = effectiveLetter;
    if (!session || !profile || !prev || prev === effectiveLetter) return;
    const ps = letterPxS[prev];
    if (!ps) return;
    const row = profile.letters[prev];
    const serverP = row?.prominence ?? 0.62;
    const serverS = row?.spread ?? 0.38;
    if (Math.abs(ps.p - serverP) < 1e-4 && Math.abs(ps.s - serverS) < 1e-4) return;
    void patchLetterPxS(prev, ps.p, ps.s).catch(() => {});
  }, [effectiveLetter, letterPxS, profile, session, patchLetterPxS, profile?.phase]);

  useEffect(() => {
    if (!isCoveragePhase(profile?.phase) || coverageSelectedIndex === null) return;
    const t = window.setTimeout(() => {
      try {
        const c = clampLab(labL, labA, labB);
        const h = labToHex(c.L, c.a, c.b);
        setCoverageIndexHex((prev) => ({ ...prev, [coverageSelectedIndex]: h }));
      } catch {
        /* ignore */
      }
    }, 60);
    return () => clearTimeout(t);
  }, [labL, labA, labB, profile?.phase, coverageSelectedIndex]);

  const beginWithName = async (forceNew = false) => {
    const dn = nameInput.trim();
    if (!dn) {
      setToast("Please enter your name.");
      return;
    }
    if (forceNew) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
    setBusy(true);
    try {
      const data = await labFetch<{
        profile_id: string;
        display_name: string;
        slug: string;
        preview: RenderPayload;
        resumed?: boolean;
      }>("/api/lab/profile/init", {
        method: "POST",
        body: JSON.stringify({
          display_name: dn,
          mode: "local_training_first",
          track: selectedTrack,
          force_new: forceNew,
        }),
      });
      persistSession({ profileId: data.profile_id, displayName: data.display_name, slug: data.slug });
      setRenderNow(data.preview);
      await loadState(data.profile_id);
      setGate("lab");
      if (forceNew) {
        setToast("Started a fresh profile under your name.");
      } else {
        setToast(data.resumed ? "Welcome back — continuing your palette." : "Your palette room is ready.");
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  };

  const resumeSession = async () => {
    const s = loadSessionFromStorage();
    if (!s) {
      setToast("No saved session in this browser.");
      return;
    }
    setBusy(true);
    try {
      await loadState(s.profileId);
      setSession(s);
      setGate("lab");
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setToast("Previous session expired — start fresh with your name.");
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  const switchProfile = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setProfile(null);
    setGate("entry");
    setNameInput("");
    setSelectedLetter(null);
    setLetterPxS(initialLetterPxS());
    setCoverageSelectedIndex(null);
    setCoverageLabPickerIndex(null);
    setCoverageIndexHex({});
    setCoverageIndexPxS({});
    setCovBoundary([]);
    setAdvancedToolsOpen(false);
  };

  const onFeelsLikeMe = async () => {
    if (!session) return;
    try {
      await labFetch("/api/lab/complete", {
        method: "POST",
        body: JSON.stringify({ profile_id: session.profileId, satisfaction: "ready" }),
      });
      await loadState(session.profileId);
      setToast("You're ready to create when you want to.");
      setAdvancedToolsOpen(false);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Complete failed");
    }
  };

  const syncHexInputsFromNumbers = (L: number, a: number, b: number) => {
    const c = clampLab(L, a, b);
    setLabL(c.L);
    setLabA(c.a);
    setLabB(c.b);
  };

  const onPlaneMouse = (clientX: number, clientY: number) => {
    const el = planeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const a = (px - 0.5) * 2 * AB_RANGE;
    const b = (0.5 - py) * 2 * AB_RANGE;
    syncHexInputsFromNumbers(labL, a, b);
  };

  const paintChromaPlane = useCallback(() => {
    const wrap = planeRef.current;
    const canvas = chromaCanvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    let w = Math.round(wrap.clientWidth || wrap.offsetWidth || rect.width);
    if (!Number.isFinite(w) || w < 48) w = 280;
    w = Math.max(120, Math.min(360, w));
    const h = w;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = Math.max(0, Math.min(100, labLPlaneRef.current));
    const step = 2;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const a = (px / Math.max(1, w - 1) - 0.5) * 2 * AB_RANGE;
        const b = (0.5 - py / Math.max(1, h - 1)) * 2 * AB_RANGE;
        ctx.fillStyle = labToHex(L, a, b);
        ctx.fillRect(px, py, step + 0.6, step + 0.6);
      }
    }
  }, []);

  /** Flex / aspect-ratio layouts often report 0×0 for one frame; repaint on the next ticks too. */
  const scheduleChromaPaint = useCallback(() => {
    requestAnimationFrame(() => {
      paintChromaPlane();
      requestAnimationFrame(() => paintChromaPlane());
    });
  }, [paintChromaPlane]);

  useLayoutEffect(() => {
    paintChromaPlane();
  }, [labL, profile?.profile_id, paintChromaPlane]);

  useEffect(() => {
    scheduleChromaPaint();
  }, [labL, labA, labB, profile?.profile_id, scheduleChromaPaint]);

  useEffect(() => {
    const wrap = planeRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      scheduleChromaPaint();
    });
    ro.observe(wrap);
    scheduleChromaPaint();
    return () => {
      ro.disconnect();
    };
  }, [profile?.profile_id, profile?.phase, scheduleChromaPaint]);

  useEffect(() => {
    if (isCoveragePhase(profile?.phase) && coverageLabPickerIndex !== null) {
      scheduleChromaPaint();
    }
  }, [coverageLabPickerIndex, profile?.phase, scheduleChromaPaint]);

  const toggleCoverageLabPicker = (index: number) => {
    setCoverageSelectedIndex(index);
    setCoverageLabPickerIndex((prev) => (prev === index ? null : index));
  };

  const saveAnchor = async () => {
    if (!session || !effectiveLetter) return;
    const c = clampLab(labL, labA, labB);
    setBusy(true);
    try {
      const ps = letterPxS[effectiveLetter] ?? DEFAULT_PICKER_PXS;
      const res = await labFetch<{ render_payload: RenderPayload; toast?: string }>(
        `/api/lab/letters/${encodeURIComponent(effectiveLetter)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            profile_id: session.profileId,
            lab_l: c.L,
            lab_a: c.a,
            lab_b: c.b,
            prominence: ps.p,
            spread: ps.s,
            locked: false,
            source: "manual",
          }),
        },
      );
      setRenderNow(res.render_payload);
      if (res.toast) setToast(res.toast);
      const snap = await loadState(session.profileId);
      if (snap?.phase === "letters") {
        if (snap.next_task.type === "letter" && snap.next_task.id) {
          setSelectedLetter(String(snap.next_task.id).toLowerCase());
        } else {
          setSelectedLetter(null);
        }
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetEditor = () => {
    if (!profile || !effectiveLetter) return;
    const row = profile.letters[effectiveLetter];
    if (!row) return;
    const { L, a, b } = clampLab(row.lab_l, row.lab_a, row.lab_b);
    setLabL(L);
    setLabA(a);
    setLabB(b);
  };

  /** Previous letter in manifest order (seed shuffle), not A–Z. Switches editor to that letter. */
  const goToManifestPreviousLetter = () => {
    if (!profile || !effectiveLetter) return;
    const cur = effectiveLetter.toLowerCase();
    const orderRaw = profile.letters_order;
    let prev: string | null = null;
    if (orderRaw?.length) {
      const order = orderRaw.map((c) => String(c).toLowerCase());
      const idx = order.indexOf(cur);
      if (idx < 0) {
        setToast("Letter not found in session order.");
        return;
      }
      if (idx === 0) {
        setToast("No previous letter in this session.");
        return;
      }
      prev = order[idx - 1]!;
    } else {
      const code = cur.charCodeAt(0);
      if (code <= "a".charCodeAt(0)) {
        setToast("No previous letter before A.");
        return;
      }
      prev = String.fromCharCode(code - 1);
    }
    const row = profile.letters[prev];
    if (!row) {
      setToast(`No data for “${prev.toUpperCase()}”.`);
      return;
    }
    setSelectedLetter(prev);
    const { L, a, b } = clampLab(row.lab_l ?? 58, row.lab_a ?? 0, row.lab_b ?? 0);
    syncHexInputsFromNumbers(L, a, b);
  };

  const submitCoverage = async (accept: boolean) => {
    if (!session || task?.type !== "coverage_word" || !task.id) return;
    const word = String(task.id);
    const manual: {
      index: number;
      char: string;
      color: string;
      prominence: number;
      spread: number;
    }[] = [];
    for (let i = 0; i < word.length; i++) {
      const c = word[i]!;
      if (!/[a-z]/i.test(c)) continue;
      const low = c.toLowerCase();
      const row = profile?.letters[low];
      const col =
        coverageIndexHex[i] ??
        (row?.color?.startsWith("#") ? row.color : row?.color ? `#${row.color}` : "#4a5dff");
      const ps = coverageIndexPxS[i] ?? COVERAGE_DEFAULT_PXS;
      manual.push({
        index: i,
        char: low,
        color: col.startsWith("#") ? col : `#${col}`,
        prominence: Math.max(0, Math.min(1, ps.prominence)),
        spread: Math.max(0, Math.min(1, ps.spread)),
      });
    }
    setBusy(true);
    try {
      const res = await labFetch<{ render_payload: RenderPayload; toast?: string }>(
        `/api/lab/coverage/${encodeURIComponent(word)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            profile_id: session.profileId,
            accepted_prediction: accept,
            manual_adjustments: {
              letters: manual,
              boundary_influence: covBoundary.length > 0 ? covBoundary : undefined,
            },
          }),
        },
      );
      setRenderNow(res.render_payload);
      if (res.toast) setToast(res.toast);
      await loadState(session.profileId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const submitCheck = async (label: "looks_right" | "almost_right" | "needs_fixing") => {
    if (!session || task?.type !== "evaluation_check" || !task.id) return;
    setBusy(true);
    try {
      const res = await labFetch<{ render_payload: RenderPayload }>(
        `/api/lab/checks/${encodeURIComponent(task.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ profile_id: session.profileId, feedback_label: label, feedback_text: null }),
        },
      );
      setRenderNow(res.render_payload);
      await loadState(session.profileId);
      setToast("Recorded.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const startTrain = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await labFetch<{ run_id: string }>("/api/lab/train", {
        method: "POST",
        body: JSON.stringify({ profile_id: session.profileId, triggered_by: "ui" }),
      });
      setLastRunId(res.run_id);
      setRunStatus("queued");
      const poll = async () => {
        const st = await labFetch<TrainRunStatus>(`/api/lab/train/${res.run_id}`);
        setRunStatus(st.status);
        setTrainReport(st);
        if (st.status === "running" || st.status === "queued") {
          setTimeout(poll, 1200);
        } else {
          await loadState(session.profileId);
          setToast(
            st.status === "succeeded" ? "Preview is now following your latest pass." : "Training ended — see debug for detail.",
          );
          setBusy(false);
        }
      };
      poll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Train failed");
      setBusy(false);
    }
  };

  const swatchPreview = useMemo(() => {
    try {
      return labToHex(clampLab(labL, labA, labB).L, clampLab(labL, labA, labB).a, clampLab(labL, labA, labB).b);
    } catch {
      return "#888888";
    }
  }, [labL, labA, labB]);

  /** Letters phase: manifest-order strip — left anchored colors, center live edit (largest), right upcoming profile colors. */
  const lettersPhaseStripSlots = useMemo((): CenterWordSlot[] | null => {
    if (profile?.phase !== "letters" || !effectiveLetter || !profile.letters_order?.length) return null;
    const order = profile.letters_order.map((c) => String(c).toLowerCase());
    const cur = effectiveLetter.toLowerCase();
    const idx = order.indexOf(cur);
    if (idx < 0) return null;

    const radius = 2;
    const from = Math.max(0, idx - radius);
    const to = Math.min(order.length - 1, idx + radius);

    const toGlyph = (hex: string, p: number, spr: number, ch: string): LightGlyphCss => {
      const st = annotateWordLetterStyle(hexCoreForLab(hex), p, spr, {
        letter: ch,
        backgroundHex: BYO_BG,
      });
      return {
        color: String(st.color ?? hex),
        opacity: typeof st.opacity === "number" ? st.opacity : 1,
        textShadow: String(st.textShadow ?? ""),
        WebkitTextStroke: st.WebkitTextStroke ? String(st.WebkitTextStroke) : undefined,
        paintOrder: st.paintOrder,
        filter: st.filter ? String(st.filter) : undefined,
      };
    };

    const slots: CenterWordSlot[] = [];
    for (let i = from; i <= to; i++) {
      const ch = order[i]!;
      const row = profile.letters[ch];
      const dist = Math.abs(i - idx);
      const displayScale = dist === 0 ? 1 : dist === 1 ? 0.66 : 0.35;
      const psP = letterPxS[ch]?.p ?? row?.prominence ?? DEFAULT_PICKER_PXS.p;
      const psS = letterPxS[ch]?.s ?? row?.spread ?? DEFAULT_PICKER_PXS.s;

      if (i < idx) {
        const hex = row?.color ? hexCoreForLab(row.color) : "#3f3f46";
        const glyphCss: LightGlyphCss = row?.annotated
          ? toGlyph(hex, psP, psS, ch)
          : {
              color: "rgba(38, 40, 44, 0.4)",
              opacity: 1,
              textShadow: "0 1px 0 rgba(255,255,255,0.55)",
              filter: undefined,
            };
        slots.push({
          key: `lt-${i}-${ch}`,
          char: ch.toUpperCase(),
          color: hex,
          glyphCss,
          displayScale,
          selectable: true,
          onSelect: () => setSelectedLetter(ch),
        });
      } else if (i === idx) {
        const hex = hexCoreForLab(swatchPreview);
        const p0 = letterPxS[ch]?.p ?? DEFAULT_PICKER_PXS.p;
        const s0 = letterPxS[ch]?.s ?? DEFAULT_PICKER_PXS.s;
        slots.push({
          key: `cur-${ch}`,
          char: ch.toUpperCase(),
          color: hex,
          glyphCss: toGlyph(hex, p0, s0, ch),
          displayScale,
          focused: true,
        });
      } else {
        const hex = row?.color ? hexCoreForLab(row.color) : "#57534e";
        slots.push({
          key: `rt-${i}-${ch}`,
          char: ch.toUpperCase(),
          color: hex,
          glyphCss: toGlyph(hex, psP, psS, ch),
          displayScale,
          selectable: true,
          onSelect: () => setSelectedLetter(ch),
        });
      }
    }
    return slots;
  }, [profile?.phase, profile?.letters_order, profile?.letters, effectiveLetter, letterPxS, swatchPreview]);

  const lightnessTrackGradient = useMemo(() => {
    const nStops = 18;
    const parts: string[] = [];
    for (let i = 0; i <= nStops; i++) {
      const t = i / nStops;
      const L = t * 100;
      const c = clampLab(L, labA, labB);
      try {
        parts.push(`${labToHex(c.L, c.a, c.b)} ${(t * 100).toFixed(2)}%`);
      } catch {
        parts.push(`#888888 ${(t * 100).toFixed(2)}%`);
      }
    }
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  }, [labA, labB]);

  const coveragePatternProgress = useMemo(() => {
    if (!profile) return { fraction: 0, covered: 0, total: 0 };
    const universe = new Set<string>();
    for (const w of profile.coverage_words) {
      for (const p of wordPairPatterns(w)) universe.add(p);
    }
    const covered = new Set<string>();
    for (const row of profile.coverage) {
      if (!row.completed) continue;
      for (const p of wordPairPatterns(row.word)) {
        if (universe.has(p)) covered.add(p);
      }
    }
    const total = universe.size;
    const coveredCount = covered.size;
    return {
      fraction: total > 0 ? Math.min(1, coveredCount / total) : 0,
      covered: coveredCount,
      total,
    };
  }, [profile]);

  const showAcceptPrediction = useMemo(() => {
    if (!profile || !task?.id || !isCoveragePhase(profile.phase)) return false;
    const wordTier = coverageTierForWord(profile, String(task.id));
    if (wordTier === "anchor") return false;
    if (profile.phase === "coverage_anchor") return false;
    if ((profile.manifest_version ?? 1) < 2) {
      const wl = String(task.id).toLowerCase();
      const first10 = profile.coverage_words.slice(0, 10).map((w) => w.toLowerCase());
      if (first10.includes(wl)) return false;
    }
    return wordTier === "assist" || profile.phase === "coverage_assist";
  }, [profile, task?.id, profile?.phase, profile?.manifest_version, profile?.coverage_words]);

  const currentCoverageWordTier = useMemo(() => {
    if (!profile || !task?.id || task.type !== "coverage_word") return undefined;
    return coverageTierForWord(profile, String(task.id));
  }, [profile, task?.id, task?.type]);

  const coverageContrastSuggestion = useMemo(() => {
    if (!profile || !task?.id || !isCoveragePhase(profile.phase)) {
      return {
        hex: COVERAGE_WORD_BACKGROUND,
        minLContrast: 0,
        avgLContrast: 0,
        defaultMinLContrast: 0,
      };
    }
    const hexes = coverageWordLetterHexes(String(task.id), profile.letters, coverageIndexHex);
    return farthestBackgroundForLetterColors(hexes);
  }, [profile, task?.id, profile?.phase, coverageIndexHex]);

  const contrastBgWorthSuggesting =
    coverageContrastSuggestion.hex.toLowerCase() !== COVERAGE_WORD_BACKGROUND.toLowerCase() ||
    coverageContrastSuggestion.minLContrast > coverageContrastSuggestion.defaultMinLContrast + 2;

  if (gate === "entry") {
    /** Resume only after mount — session is hydrated from localStorage in useEffect (avoids SSR/client HTML mismatch). */
    const showResume = session !== null;
    return (
      <main className="min-h-[calc(100vh-4rem)] px-6 py-16" style={{ background: BYO_BG, color: BYO_TEXT }}>
        <div className="mx-auto max-w-lg rounded-3xl border border-[#002FA7]/15 bg-[#FFFCF3]/95 p-10 shadow-sm backdrop-blur-sm">
          <h1 className="font-display text-3xl font-semibold tracking-tight" style={{ color: BYO_TEXT }}>
            Start with your name
          </h1>
          <p className="mt-3 text-sm leading-relaxed opacity-80">
            Create your own color profile before you begin. Everything you anchor stays under your name — nothing mixes
            with anyone else on this machine.
          </p>
          {apiOnline === false && (
            <p className="mt-4 rounded-xl border border-red-300/40 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900">
              Backend offline — start the API on port 8000 (e.g.{" "}
              <code className="font-mono text-[11px]">cd apps/api && uv run uvicorn app.main:app --reload</code>
              ), then refresh.
            </p>
          )}
          <label className="mt-8 block text-xs font-medium uppercase tracking-wider opacity-70">Your name</label>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Emma"
            className="mt-2 w-full rounded-xl border border-[#002FA7]/20 bg-white px-4 py-3 text-base outline-none transition focus:ring-2 focus:ring-[#FFD447]/70"
            style={{ color: BYO_TEXT }}
          />
          <p className="mt-8 text-xs font-medium uppercase tracking-wider opacity-70">Depth</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["lite", "Quick start", "Anchor 26 letters → preview immediately"],
                ["deep", "Full profile", "Letters + 30 words + 10 checks → training"],
              ] as const
            ).map(([val, title, desc]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSelectedTrack(val)}
                className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${
                  selectedTrack === val
                    ? "border-[#002FA7]/60 bg-[#002FA7]/08 font-semibold"
                    : "border-[#002FA7]/20 opacity-70 hover:bg-[#FFD447]/12"
                }`}
                style={{ color: BYO_TEXT }}
              >
                <span className="block font-semibold">{title}</span>
                <span className="mt-0.5 block opacity-75">{desc}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || apiOnline === false}
            onClick={() => beginWithName(false)}
            className="mt-6 w-full rounded-full py-3.5 text-sm font-medium text-white shadow-md transition disabled:opacity-50"
            style={{ background: BYO_TEXT }}
          >
            Continue with this name
          </button>
          <button
            type="button"
            disabled={busy || apiOnline === false}
            onClick={() => beginWithName(true)}
            className="mt-3 w-full rounded-full border border-[#002FA7]/25 py-3 text-sm opacity-90 hover:bg-[#FFD447]/15 disabled:opacity-50"
            style={{ color: BYO_TEXT }}
          >
            Start fresh profile
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed opacity-60">
            Continue restores progress for this name on this device. Start fresh creates a blank profile (your old data
            stays in the database but is unlinked from this browser).
          </p>
          {showResume && (
            <button
              type="button"
              disabled={busy || apiOnline === false}
              onClick={resumeSession}
              className="mt-3 w-full rounded-full border border-[#002FA7]/25 py-3 text-sm opacity-90 hover:bg-[#FFD447]/15 disabled:opacity-50"
              style={{ color: BYO_TEXT }}
            >
              Resume last session on this browser
            </button>
          )}
        </div>
        {toast && (
          <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-6 py-2.5 text-sm text-stone-100 shadow-lg">
            {toast}
          </div>
        )}
      </main>
    );
  }

  if (!profile || !session) {
    return (
      <main className="min-h-[40vh] px-6 py-20 text-center opacity-80" style={{ background: BYO_BG, color: BYO_TEXT }}>
        Loading your palette…
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)]" style={{ background: BYO_BG, color: BYO_TEXT }}>
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-full bg-stone-900 px-6 py-2.5 text-center text-sm text-stone-100 shadow-lg">
          {toast}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[min(96rem,calc(100vw-1rem))] flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:px-6">
        {/* Profile, task, and word annotator */}
        <section className="flex w-full flex-col rounded-3xl border border-[#002FA7]/12 bg-[#FFFCF3]/92 px-4 py-5 shadow-sm backdrop-blur-sm sm:p-6">
          {profile.phase !== "free_text" && profile.phase !== "create" ? (
          <div className="mb-6 w-full">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-55">Effect preview</p>
            <div
              className="flex min-h-[4.5rem] w-full justify-center rounded-xl border border-[#002FA7]/10 bg-white px-8 py-5 text-center text-2xl leading-[1.45] tracking-normal sm:min-h-[5rem] sm:px-10 sm:py-5 sm:text-3xl"
              style={{ fontFamily: EFFECT_PREVIEW_FONT, fontWeight: EFFECT_PREVIEW_BASE_WEIGHT }}
            >
              {displayEffectPreviewTokens?.length ? (
                <ReadingPreviewTokens
                  tokens={displayEffectPreviewTokens}
                  className="inline-block max-w-none text-left"
                  backgroundHex="#FFFFFF"
                  thinPassageFont
                />
              ) : (
                <span className="font-body text-base font-normal opacity-40">
                  Preview loads after letters are anchored, or after coverage/check saves.
                </span>
              )}
            </div>
          </div>
          ) : null}

          <div className="flex flex-wrap items-start gap-6 border-b border-[#002FA7]/12 pb-5 sm:gap-8">
            <div className="min-w-0 shrink-0">
              <p className="font-display text-lg font-semibold" style={{ color: BYO_TEXT }}>
                {session.displayName}&rsquo;s Palette
              </p>
              <p className="mt-0.5 font-mono text-[11px] opacity-55">profile · {session.slug}</p>
              <button
                type="button"
                className="mt-2 text-[10px] font-medium uppercase tracking-wide opacity-60 underline decoration-[#002FA7]/35 underline-offset-2 transition hover:opacity-100"
                style={{ color: BYO_TEXT }}
                aria-expanded={metainfoOpen}
                aria-controls="byo-metainfo-panel"
                onClick={() => setMetainfoOpen((v) => !v)}
              >
                metainfo
              </button>
              {metainfoOpen ? (
                <div
                  id="byo-metainfo-panel"
                  className="mt-2 max-w-md rounded-lg border border-[#002FA7]/12 bg-white/75 px-2.5 py-2 text-[10px] leading-relaxed shadow-sm sm:text-[11px]"
                  style={{ color: BYO_TEXT }}
                >
                  <p className="font-mono text-[9px] opacity-55 sm:text-[10px]">id · {profile.profile_id}</p>
                  <p className="mt-1.5">
                    <span className="font-medium opacity-100">30-word list:</span>{" "}
                    {profile.coverage_kb_label || profile.coverage_kb_vocab_version_id ? (
                      <>
                        from knowledge base
                        {profile.coverage_kb_label ? ` · ${profile.coverage_kb_label}` : ""}
                        {profile.coverage_kb_vocab_version_id && !profile.coverage_kb_label
                          ? ` · ${profile.coverage_kb_vocab_version_id}`
                          : ""}
                      </>
                    ) : (
                      <>
                        built-in seed words (no KB snapshot was linked when this profile was created). Start a{" "}
                        <button
                          type="button"
                          className="underline decoration-[#002FA7]/35 underline-offset-2"
                          onClick={switchProfile}
                        >
                          new profile
                        </button>{" "}
                        with the API running and an active KB version to get the same greedy top-30 as KB Lab.
                      </>
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            <ByoWorkflowStepper
              phase={profile.phase}
              lettersAnchored={profile.progress.letters_anchored_count}
              wordsSaved={profile.progress.coverage_completed_count}
              checksDone={profile.progress.checks_completed_count}
              ink={BYO_TEXT}
              track={profile.track}
            />
            <button
              type="button"
              onClick={() => setAdvancedToolsOpen(true)}
              className="ml-auto shrink-0 rounded-full border border-[#002FA7]/20 px-3 py-1.5 text-xs opacity-90 hover:bg-[#FFD447]/18"
              style={{ color: BYO_TEXT }}
            >
              Fine-tune & tools
            </button>
          </div>

          <div className="mt-6 overflow-visible text-center">
            {profile.phase === "letters" && (
              <>
                <OrbitSegmentRing
                  centerSlots={lettersPhaseStripSlots ?? undefined}
                  centerLabel={(effectiveLetter ?? profile.letters_order[0] ?? "·").toUpperCase()}
                  centerColor={lettersPhaseStripSlots ? undefined : swatchPreview}
                  centerAnnotateStyle={
                    lettersPhaseStripSlots
                      ? undefined
                      : effectiveLetter
                        ? annotateWordLetterStyle(
                            hexCoreForLab(swatchPreview),
                            letterPxS[effectiveLetter]?.p ?? DEFAULT_PICKER_PXS.p,
                            letterPxS[effectiveLetter]?.s ?? DEFAULT_PICKER_PXS.s,
                            { letter: effectiveLetter, backgroundHex: BYO_BG },
                          )
                        : undefined
                  }
                  centerScanlines={0}
                  centerStripMaxWidthClass="max-w-[min(100%,29.12rem)]"
                  caption={`${profile.progress.letters_anchored_count} / 26 letters anchored`}
                  captionAccessory={
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#002FA7]/28 text-[10px] font-bold leading-none transition hover:bg-[#FFD447]/25"
                      style={{ color: BYO_TEXT }}
                      aria-expanded={lettersChromaTipsOpen}
                      aria-controls="byo-letters-chroma-tips"
                      title="Chroma / LAB 说明"
                      onClick={() => setLettersChromaTipsOpen((v) => !v)}
                    >
                      i
                    </button>
                  }
                />
                {lettersChromaTipsOpen ? (
                  <div
                    id="byo-letters-chroma-tips"
                    className="mx-auto mt-2 max-w-md rounded-xl border border-[#002FA7]/12 bg-white/80 px-3 py-2.5 text-left shadow-sm"
                    style={{ color: BYO_TEXT }}
                  >
                    <p className="text-[11px] font-semibold leading-snug sm:text-xs">Chroma (a* × b*) at this L*</p>
                    <p className="mt-1.5 text-[10px] leading-relaxed opacity-85 sm:text-[11px]">
                      横 a* · 纵 b*；先点平面再调 L*。
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-[10px] underline opacity-70"
                      style={{ color: BYO_TEXT }}
                      onClick={() => setLettersChromaTipsOpen(false)}
                    >
                      收起
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {isCoveragePhase(profile.phase) && task?.id && (
              <div id="byo-coverage-word" className="mt-2 text-left">
                <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 text-center">
                  <p className="text-[11px] opacity-75" style={{ color: BYO_TEXT }}>
                    {(profile.manifest_version ?? 1) >= 2 ? (
                      <>
                        Anchor {profile.progress.anchor_completed_count ?? 0} / {profile.progress.anchor_total ?? 10}
                        {" · "}
                        Assist {profile.progress.assist_completed_count ?? 0} / {profile.progress.assist_total ?? 20}
                        {" · "}
                      </>
                    ) : null}
                    {coveragePatternProgress.covered} / {coveragePatternProgress.total} pair patterns ·{" "}
                    {profile.progress.coverage_completed_count} / 30 words saved
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#002FA7]/28 text-[10px] font-bold leading-none transition hover:bg-[#FFD447]/25"
                    style={{ color: BYO_TEXT }}
                    aria-expanded={coverageTipsOpen}
                    aria-controls="byo-coverage-tips"
                    title="How to annotate this word"
                    onClick={() => setCoverageTipsOpen((v) => !v)}
                  >
                    i
                  </button>
                </div>
                {coverageTipsOpen ? (
                  <div
                    id="byo-coverage-tips"
                    className="mx-auto mb-3 max-w-lg rounded-xl border border-[#002FA7]/12 bg-white/80 px-3 py-2.5 text-left text-[10px] leading-relaxed shadow-sm sm:text-[11px]"
                    style={{ color: BYO_TEXT }}
                  >
                    <p className="font-semibold opacity-90">How to annotate</p>
                    {(profile.manifest_version ?? 1) >= 2 && profile.phase === "coverage_anchor" ? (
                      <p className="mt-1.5 opacity-88">
                        Anchor (first 10 words): annotate every letter&apos;s color and P×S manually — no prefill; use Save word when done.
                      </p>
                    ) : null}
                    {(profile.manifest_version ?? 1) >= 2 && profile.phase === "coverage_assist" ? (
                      <p className="mt-1.5 opacity-88">
                        Assist (next 20 words): color and P×S are prefilled from annotated n-grams. Use Accept prediction if it looks right, otherwise edit and Save word.
                      </p>
                    ) : null}
                    {(profile.manifest_version ?? 1) < 2 && currentCoverageWordTier === "assist" ? (
                      <p className="mt-1.5 opacity-88">
                        Words 11–30: colors and P×S are prefilled from your first 10 words + model. Use Accept prediction if it looks right, otherwise edit and Save word.
                      </p>
                    ) : null}
                    <p className="mt-2 leading-relaxed opacity-88">
                      <strong className="font-medium">Effect preview</strong> (above) shows a live synesthesia sentence — one per word. The large word below is the one you are annotating.
                    </p>
                    <p className="mt-1.5 leading-relaxed opacity-88">
                      Each column is a canvas: drag the overlay for <strong className="font-medium">P</strong> (vertical, glow strength) and{" "}
                      <strong className="font-medium">S</strong> (horizontal, spread). The <strong className="font-medium">D</strong> bar between letters controls boundary blend.
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 opacity-85">
                      <li>Tap ◎ on a column to open LAB; click a letter in the preview word to select it.</li>
                      <li>Drag on the canvas for P×S; double-click the canvas to fill the whole tile with that letter&apos;s color (display only — double-click again to clear).</li>
                      <li>D bar: drag to bias the blend, double-click to center. At a <strong className="font-medium">line break</strong>, the last column of a row also has a D bar linking to the next line.</li>
                      <li>Long words split into balanced rows; words with spaces break at spaces.</li>
                      <li>If a letter color is too close to the background, a same-hue outline is added (fill color unchanged).</li>
                      <li>
                        When letter colors clash with the cream background, use <strong className="font-medium">Use contrast background</strong> for a soft top-down color wash behind the preview word (display only — not saved with the word).
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="mt-2 text-[10px] underline opacity-70"
                      style={{ color: BYO_TEXT }}
                      onClick={() => setCoverageTipsOpen(false)}
                    >
                      Collapse
                    </button>
                  </div>
                ) : null}
                {currentCoverageWordTier === "assist" && coveragePredictionStatus === "loading" ? (
                  <p
                    className="mx-auto mb-3 max-w-lg rounded-xl border border-[#002FA7]/15 bg-[#FFD447]/12 px-3 py-2 text-center text-[11px]"
                    style={{ color: BYO_TEXT }}
                  >
                    Loading model suggestion…
                  </p>
                ) : null}
                {currentCoverageWordTier === "assist" && coveragePredictionSummary ? (
                  <p
                    className="mx-auto mb-3 max-w-lg rounded-xl border border-[#002FA7]/20 bg-[#002FA7]/6 px-3 py-2 text-center text-[11px] leading-relaxed"
                    style={{ color: BYO_TEXT }}
                  >
                    {coveragePredictionSummary}
                  </p>
                ) : null}
                <WordCoverageAnnotator
                  word={String(task.id)}
                  profile={profile}
                  wordBackgroundHex={COVERAGE_WORD_BACKGROUND}
                  contrastBg={
                    contrastBgWorthSuggesting
                      ? {
                          checked: coverageUseContrastBg,
                          onCheckedChange: setCoverageUseContrastBg,
                          suggestedHex: coverageContrastSuggestion.hex,
                          minLContrast: coverageContrastSuggestion.minLContrast,
                          defaultMinLContrast: coverageContrastSuggestion.defaultMinLContrast,
                        }
                      : undefined
                  }
                  indexHex={coverageIndexHex}
                  indexPxS={coverageIndexPxS}
                  onIndexPxSChange={(i, p, s) =>
                    setCoverageIndexPxS((prev) => ({ ...prev, [i]: { prominence: p, spread: s } }))
                  }
                  boundaryInfluence={covBoundary}
                  onBoundaryInfluenceChange={(boundaryIdx, v) =>
                    setCovBoundary((prev) => {
                      const blen = Math.max(0, String(task.id).length - 1);
                      const n = [...prev];
                      while (n.length < blen) n.push(0.5);
                      if (n.length > blen) n.length = blen;
                      if (boundaryIdx >= 0 && boundaryIdx < blen) n[boundaryIdx] = v;
                      return n;
                    })
                  }
                  selectedIndex={coverageSelectedIndex}
                  onSelectIndex={setCoverageSelectedIndex}
                  labPickerIndex={coverageLabPickerIndex}
                  onLabPickerToggle={toggleCoverageLabPicker}
                  onCloseLabPicker={() => setCoverageLabPickerIndex(null)}
                  labPicker={{
                    labL,
                    labA,
                    labB,
                    swatchPreview,
                    lightnessTrackGradient,
                    planeRef,
                    chromaCanvasRef,
                    dragPlane,
                    onPlaneMouse,
                    syncHexInputsFromNumbers,
                  }}
                  canvasBgHex={coverageCanvasBgHex}
                  onAddColorToBackground={(hex, letterIndex) => {
                    setCoverageCanvasBgHex((prev) => {
                      const norm = hex.startsWith("#") ? hex : `#${hex}`;
                      if (prev[letterIndex]?.toLowerCase() === norm.toLowerCase()) {
                        const next = { ...prev };
                        delete next[letterIndex];
                        return next;
                      }
                      return { ...prev, [letterIndex]: norm };
                    });
                  }}
                />
              </div>
            )}
            {profile.phase === "checks" && (
              <OrbitSegmentRing
                centerLabel={(task?.word ?? "Check").toUpperCase()}
                caption={`${profile.progress.checks_completed_count} / 10 checks`}
              />
            )}
            {(profile.phase === "free_text" || profile.phase === "create") && (
              <OrbitSegmentRing
                centerContent={
                  <div className="mx-auto w-full max-w-[min(100%,42rem)] px-3 py-4">
                    {renderNow?.tokens?.length ? (
                      <ReadingPreviewTokens
                        tokens={renderNow.tokens}
                        className="block text-center text-[clamp(1.35rem,4.2vw,2.35rem)] leading-relaxed tracking-normal"
                        backgroundHex={BYO_BG}
                        thinPassageFont
                      />
                    ) : (
                      <span className="block text-center font-body text-sm opacity-45">Loading preview…</span>
                    )}
                  </div>
                }
              />
            )}
          </div>

          {profile.phase === "letters" && effectiveLetter && (
            <div
              className="mx-auto mt-4 w-full max-w-[min(100%,20.8rem)] rounded-3xl border border-[#b8c2d4]/85 bg-white/90 px-2.5 py-3 shadow-[0_8px_28px_rgba(0,47,167,0.07)] sm:px-4 sm:py-4"
            >
              <p
                className="text-center font-display text-base font-semibold tracking-tight sm:text-lg"
                style={{ color: BYO_TEXT }}
              >
                {effectiveLetter.toUpperCase()} · LAB
              </p>
              <ByoChromaStack
                compact
                planeSize="lettersHero"
                planeRef={planeRef}
                chromaCanvasRef={chromaCanvasRef}
                dragPlane={dragPlane}
                labL={labL}
                labA={labA}
                labB={labB}
                swatchPreview={swatchPreview}
                lightnessTrackGradient={lightnessTrackGradient}
                ink={BYO_TEXT}
                onPlaneMouse={onPlaneMouse}
                syncHexInputsFromNumbers={syncHexInputsFromNumbers}
              />
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
                <button
                  type="button"
                  onClick={goToManifestPreviousLetter}
                  className="min-w-0 rounded-full border border-[#002FA7]/25 px-1.5 py-2 text-center text-[10px] font-medium hover:bg-[#FFD447]/15 sm:px-2.5 sm:text-xs"
                  style={{ color: BYO_TEXT }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveAnchor}
                  className="min-w-0 rounded-full px-1.5 py-2 text-center text-[10px] font-medium text-white shadow-sm disabled:opacity-50 sm:px-2.5 sm:text-xs"
                  style={{ background: BYO_TEXT }}
                >
                  Save anchor
                </button>
                <button
                  type="button"
                  onClick={resetEditor}
                  className="min-w-0 rounded-full border border-[#002FA7]/25 px-1.5 py-2 text-center text-[10px] font-medium hover:bg-[#FFD447]/15 sm:px-2.5 sm:text-xs"
                  style={{ color: BYO_TEXT }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {isCoveragePhase(profile.phase) && (
            <p
              className="mx-auto mt-3 max-w-sm text-center text-[11px] leading-snug opacity-70"
              style={{ color: BYO_TEXT }}
            >
              Words phase: per-letter columns and D bars match the English annotate page; payload uses indexed{" "}
              <code className="font-mono text-[10px]">letters[]</code> + <code className="font-mono text-[10px]">boundary_influence</code>.
            </p>
          )}

          {/* Phase actions */}
          <div className="mt-8 space-y-4 border-t border-[#002FA7]/12 pt-6">
            {isCoveragePhase(profile.phase) && task?.id && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={annotatedWordsRef}>
                  <button
                    type="button"
                    disabled={busy || annotatedCoverageWords.length === 0}
                    onClick={() => setAnnotatedWordsOpen((v) => !v)}
                    className="rounded-full border border-[#002FA7]/25 px-4 py-2 text-sm hover:bg-[#FFD447]/15 disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ color: BYO_TEXT }}
                    aria-expanded={annotatedWordsOpen}
                    aria-haspopup="listbox"
                  >
                    Saved words ({annotatedCoverageWords.length})
                  </button>
                  {annotatedWordsOpen && annotatedCoverageWords.length > 0 ? (
                    <ul
                      className="absolute bottom-full left-0 z-30 mb-2 max-h-56 min-w-[12rem] overflow-y-auto rounded-xl border border-[#002FA7]/15 bg-white py-1 shadow-lg"
                      role="listbox"
                      aria-label="Saved coverage words"
                    >
                      {annotatedCoverageWords.map((word) => {
                        const isCurrent = Boolean(
                          task?.type === "coverage_word" &&
                            task.id &&
                            word.toLowerCase() ===
                              String(task.id).toLowerCase(),
                        );
                        return (
                          <li key={word}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={isCurrent}
                              className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#FFD447]/20 ${
                                isCurrent ? "bg-[#002FA7]/8 font-semibold" : ""
                              }`}
                              style={{ color: BYO_TEXT }}
                              onClick={() => goToCoverageWord(word)}
                            >
                              {word}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
                {showAcceptPrediction ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submitCoverage(true)}
                    className="rounded-full border border-[#002FA7]/25 px-4 py-2 text-sm hover:bg-[#FFD447]/15"
                    style={{ color: BYO_TEXT }}
                  >
                    Accept prediction
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitCoverage(false)}
                  className="rounded-full px-4 py-2 text-sm text-white"
                  style={{ background: BYO_TEXT }}
                >
                  Save word
                </button>
              </div>
            )}
            {profile.phase === "checks" && task?.id && (
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["looks_right", "Looks right"],
                    ["almost_right", "Almost"],
                    ["needs_fixing", "Needs fixing"],
                  ] as const
                ).map(([k, lab]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => submitCheck(k)}
                    className="rounded-full border border-[#002FA7]/25 px-3 py-1.5 text-sm hover:bg-[#FFD447]/15"
                    style={{ color: BYO_TEXT }}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            )}
            {profile.phase === "free_text" && (
              <div className="space-y-3">
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-[#002FA7]/20 bg-white p-3 text-sm"
                  style={{ color: BYO_TEXT }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const prev = await labFetch<RenderPayload>("/api/lab/preview", {
                        method: "POST",
                        body: JSON.stringify({
                          profile_id: session.profileId,
                          mode: "free_text",
                          text: freeText,
                        }),
                      });
                      setRenderNow(prev);
                    }}
                    className="rounded-full border border-[#002FA7]/25 px-4 py-2 text-sm hover:bg-[#FFD447]/15"
                    style={{ color: BYO_TEXT }}
                  >
                    Update preview
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => navigateToColorStudio(router, session)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm"
                    style={{ background: BYO_TEXT }}
                  >
                    Open letter color cards
                  </button>
                </div>
                <p className="text-[10px] opacity-55">
                  Reading map above updates automatically ~0.5s after you stop typing; use button for an immediate
                  refresh. When you are happy with your anchors, open Color Studio to export PNG or PDF cards.
                </p>
              </div>
            )}
            {profile.phase === "create" && (
              <div className="space-y-4">
                <p className="text-sm opacity-80">
                  Your color field is formed. Export printable letter cards or continue to passage PDFs in Color Studio.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => navigateToColorStudio(router, session)}
                  className="rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-md"
                  style={{ background: BYO_TEXT }}
                >
                  Open Color Studio — export cards
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {advancedToolsOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="byo-advanced-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            aria-label="Close dialog"
            onClick={() => setAdvancedToolsOpen(false)}
          />
          <div className="relative z-[101] mt-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[#002FA7]/15 bg-[#FFFCF3] p-5 shadow-2xl sm:mt-0 sm:rounded-2xl">
            <h3 id="byo-advanced-title" className="font-display text-lg font-semibold" style={{ color: BYO_TEXT }}>
              Fine-tune & tools
            </h3>
            <p className="mt-1 text-xs opacity-70">Switch profile, optional training, completion, and debug.</p>
            <div className="mt-5 space-y-4">
              <button
                type="button"
                onClick={() => switchProfile()}
                className="w-full rounded-full border border-[#002FA7]/25 py-2.5 text-sm hover:bg-[#FFD447]/15"
                style={{ color: BYO_TEXT }}
              >
                Switch profile
              </button>

              <div className="rounded-xl border border-[#002FA7]/12 bg-white/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-55">Refresh model</p>
                <p className="mt-1 text-[11px] opacity-65">
                  Fine-tune <code className="font-mono text-[10px]">letter_sequence.pt</code> on your BYO samples
                  (letters; plus words/checks on full track).
                </p>
                <button
                  type="button"
                  disabled={busy || profile.training_status === "running" || profile.training_status === "queued"}
                  onClick={() => void startTrain()}
                  className="mt-3 w-full rounded-full border-2 py-2.5 text-sm font-medium transition disabled:opacity-40"
                  style={{ borderColor: BYO_TEXT, color: BYO_TEXT }}
                >
                  {profile.training_status === "running" || profile.training_status === "queued"
                    ? "Training…"
                    : "Run training pass"}
                </button>
              </div>

              {SHOW_CV_PANEL && trainReport?.cv_summary && Object.keys(trainReport.cv_summary).length > 0 ? (
                <div className="rounded-xl border border-[#002FA7]/12 bg-white/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-55">Cross-validation</p>
                  <p className="mt-1 text-[11px] opacity-75">
                    Status: {trainReport.cv_status ?? "—"}
                    {trainReport.cv_summary.composite ? (
                      <>
                        {" "}
                        · composite{" "}
                        {trainReport.cv_summary.composite.mean?.toFixed(2) ?? "—"} ±{" "}
                        {trainReport.cv_summary.composite.std?.toFixed(2) ?? "—"}
                      </>
                    ) : null}
                    {trainReport.cv_summary.mae_lab ? (
                      <>
                        {" "}
                        · mae_lab {trainReport.cv_summary.mae_lab.mean?.toFixed(2) ?? "—"} ±{" "}
                        {trainReport.cv_summary.mae_lab.std?.toFixed(2) ?? "—"}
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[10px] opacity-60">Small-sample estimate; hide via NEXT_PUBLIC_LAB_SHOW_CV=0</p>
                </div>
              ) : null}

              {profile.phase === "free_text" ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => navigateToColorStudio(router, session)}
                    className="w-full rounded-full border border-[#002FA7]/25 py-2.5 text-sm hover:bg-[#FFD447]/15"
                    style={{ color: BYO_TEXT }}
                  >
                    Open letter color cards
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onFeelsLikeMe()}
                    className="w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: BYO_TEXT }}
                  >
                    This feels like me
                  </button>
                </div>
              ) : profile.phase === "create" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => navigateToColorStudio(router, session)}
                  className="w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: BYO_TEXT }}
                >
                  Open Color Studio — export cards
                </button>
              ) : null}

              <div className="border-t border-[#002FA7]/12 pt-3">
                <button
                  type="button"
                  onClick={() => setDebugOpen(!debugOpen)}
                  className="text-[11px] underline opacity-70"
                  style={{ color: BYO_TEXT }}
                >
                  {debugOpen ? "Hide" : "Show"} local debug
                </button>
                {debugOpen ? (
                  <div
                    className="mt-2 rounded-lg border border-[#002FA7]/15 bg-white/70 p-2 font-mono text-[10px] opacity-90"
                    style={{ color: BYO_TEXT }}
                  >
                    <div>{session.profileId}</div>
                    <div>training: {profile.training_status}</div>
                    <div>
                      run: {lastRunId ?? "—"} {runStatus ?? ""}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="w-full rounded-full py-2.5 text-sm opacity-80 hover:bg-black/[0.04]"
                style={{ color: BYO_TEXT }}
                onClick={() => setAdvancedToolsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
