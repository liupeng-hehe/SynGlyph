/**
 * Client-side effect preview tokens + helpers for live API preview payloads.
 */

import { COVERAGE_DEFAULT_PXS } from "@/lib/buildYourOwn/wordContrastBackground";
import { hexToLab, labToHex, clampLab } from "@/lib/labColor";

export type LiveRenderToken = {
  text: string;
  fill: string;
  prominence?: number;
  spread?: number;
  boundary_after?: number;
};

type LetterRow = {
  color?: string;
  lab_l?: number;
  lab_a?: number;
  lab_b?: number;
  prominence?: number;
  spread?: number;
};

export type LetterOverride = {
  color?: string;
  lab_l?: number;
  lab_a?: number;
  lab_b?: number;
  prominence?: number;
  spread?: number;
};

export type CoverageWordDraft = {
  word: string;
  indexHex: Record<number, string>;
  indexPxS: Record<number, { prominence: number; spread: number }>;
  boundary?: number[];
};

function hexCore(h: string): string {
  const x = h.startsWith("#") ? h : `#${h}`;
  return x.length >= 7 ? x.slice(0, 7) : "#57534e";
}

function letterFill(row: LetterRow | undefined, override?: LetterOverride): string {
  if (override?.color) return hexCore(override.color);
  if (
    override?.lab_l !== undefined &&
    override?.lab_a !== undefined &&
    override?.lab_b !== undefined
  ) {
    try {
      const c = clampLab(override.lab_l, override.lab_a, override.lab_b);
      return `#${labToHex(c.L, c.a, c.b)}`;
    } catch {
      /* fall through */
    }
  }
  if (row?.color) return hexCore(row.color);
  if (row?.lab_l !== undefined && row?.lab_a !== undefined && row?.lab_b !== undefined) {
    try {
      const c = clampLab(row.lab_l, row.lab_a, row.lab_b);
      return `#${labToHex(c.L, c.a, c.b)}`;
    } catch {
      /* fall through */
    }
  }
  return "#6b7280";
}

function letterPxS(
  row: LetterRow | undefined,
  override?: LetterOverride,
): { prominence: number; spread: number } {
  return {
    prominence: override?.prominence ?? row?.prominence ?? 0.62,
    spread: override?.spread ?? row?.spread ?? 0.38,
  };
}

export function buildLiveClientPreviewTokens(
  text: string,
  letters: Record<string, LetterRow>,
  opts?: {
    letterOverrides?: Record<string, LetterOverride>;
    wordDraft?: CoverageWordDraft;
  },
): LiveRenderToken[] {
  const draftWord = opts?.wordDraft?.word?.toLowerCase() ?? "";
  const draft = opts?.wordDraft;
  const tokens: LiveRenderToken[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      tokens.push({ text: ch, fill: "#6b7280", prominence: 0, spread: 0 });
      i += 1;
      continue;
    }

    let j = i;
    while (j < text.length && !/\s/.test(text[j]!)) j += 1;
    const word = text.slice(i, j);
    const isDraft = draft && word.toLowerCase() === draftWord;

    for (let k = 0; k < word.length; k++) {
      const c = word[k]!;
      const low = c.toLowerCase();
      let fill = "#6b7280";
      let prominence: number = COVERAGE_DEFAULT_PXS.prominence;
      let spread: number = COVERAGE_DEFAULT_PXS.spread;
      let boundary_after: number | undefined;

      if (isDraft && draft) {
        const absIdx = i + k;
        const hx = draft.indexHex[absIdx];
        const ps = draft.indexPxS[absIdx];
        if (hx) {
          try {
            const t = hexToLab(hexCore(hx).replace("#", ""));
            const lab = clampLab(t.L, t.a, t.b);
            fill = `#${labToHex(lab.L, lab.a, lab.b)}`;
          } catch {
            fill = hexCore(hx);
          }
        } else if (/[a-z]/i.test(c)) {
          fill = letterFill(letters[low], opts?.letterOverrides?.[low]);
        }
        if (ps) {
          prominence = ps.prominence;
          spread = ps.spread;
        } else if (/[a-z]/i.test(c)) {
          const px = letterPxS(letters[low], opts?.letterOverrides?.[low]);
          prominence = px.prominence;
          spread = px.spread;
        }
        if (draft.boundary && k < word.length - 1) {
          const bi = draft.boundary[absIdx];
          if (typeof bi === "number" && Number.isFinite(bi)) {
            boundary_after = Math.max(0, Math.min(1, bi));
          }
        }
      } else if (/[a-z]/i.test(c)) {
        fill = letterFill(letters[low], opts?.letterOverrides?.[low]);
        const px = letterPxS(letters[low], opts?.letterOverrides?.[low]);
        prominence = px.prominence;
        spread = px.spread;
      }

      const tok: LiveRenderToken = { text: c, fill, prominence, spread };
      if (boundary_after !== undefined) tok.boundary_after = boundary_after;
      tokens.push(tok);
    }
    i = j;
  }
  return tokens;
}

export function buildLetterOverrideFromLab(
  char: string,
  labL: number,
  labA: number,
  labB: number,
  prominence: number,
  spread: number,
): Record<string, LetterOverride> {
  const c = clampLab(labL, labA, labB);
  return {
    [char.toLowerCase()]: {
      lab_l: c.L,
      lab_a: c.a,
      lab_b: c.b,
      color: `#${labToHex(c.L, c.a, c.b)}`,
      prominence,
      spread,
    },
  };
}

export function coverageDraftToManualPayload(
  word: string,
  indexHex: Record<number, string>,
  indexPxS: Record<number, { prominence: number; spread: number }>,
  boundary: number[],
  letters: Record<string, LetterRow>,
) {
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
    const row = letters[low];
    const col =
      indexHex[i] ??
      (row?.color?.startsWith("#") ? row.color : row?.color ? `#${row.color}` : "#4a5dff");
    const ps = indexPxS[i] ?? COVERAGE_DEFAULT_PXS;
    manual.push({
      index: i,
      char: low,
      color: col.startsWith("#") ? col : `#${col}`,
      prominence: Math.max(0, Math.min(1, ps.prominence)),
      spread: Math.max(0, Math.min(1, ps.spread)),
    });
  }
  return {
    word,
    manual_adjustments: {
      letters: manual,
      boundary_influence: boundary.length > 0 ? boundary : undefined,
    },
  };
}

function textIndexInDraftWord(text: string, index: number, draftWord: string): boolean {
  if (!draftWord) return false;
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i]!)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && !/\s/.test(text[j]!)) j += 1;
    const word = text.slice(i, j);
    if (word.toLowerCase() === draftWord && index >= i && index < j) return true;
    i = j;
  }
  return false;
}

function tokenTextOffset(tokens: LiveRenderToken[], idx: number): number {
  let o = 0;
  for (let k = 0; k < idx; k++) o += tokens[k]!.text.length;
  return o;
}

/** Merge instant local edits onto the latest server/model tokens. */
export function mergeLivePreviewTokens(
  base: LiveRenderToken[] | null | undefined,
  text: string,
  letters: Record<string, LetterRow>,
  opts?: {
    letterOverrides?: Record<string, LetterOverride>;
    wordDraft?: CoverageWordDraft;
  },
): LiveRenderToken[] {
  const live = buildLiveClientPreviewTokens(text, letters, opts);
  if (!base?.length || base.length !== live.length) return live;

  const draftWord = opts?.wordDraft?.word?.toLowerCase() ?? "";
  return live.map((tok, i) => {
    const offset = tokenTextOffset(live, i);
    const low = tok.text.toLowerCase();
    const hasOverride =
      tok.text.length === 1 && /[a-z]/i.test(tok.text) && Boolean(opts?.letterOverrides?.[low]);
    const inDraft = Boolean(draftWord && textIndexInDraftWord(text, offset, draftWord));
    if (hasOverride || inDraft) return tok;
    return base[i] ?? tok;
  });
}
