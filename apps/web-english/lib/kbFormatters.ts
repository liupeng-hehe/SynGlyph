import type {
  CoverageGapPayload,
  NeighborsResponse,
  PatternPositionsResponse,
  PatternTopWordsResponse,
  SegmentComboRow,
  UnderCoveredPatternRow,
} from "@/lib/kbApi";
import { charUnits, firstMatchCharIndex, parsePatternLiteral } from "@/lib/kbPatternMatch";

function nFromUnitTypeLabel(unitType: string): number | null {
  if (unitType === "char") return 1;
  if (unitType === "bigram" || unitType === "ngram_2") return 2;
  if (unitType === "trigram" || unitType === "ngram_3") return 3;
  const m = /^ngram_(\d+)$/.exec(unitType);
  if (m) return parseInt(m[1]!, 10);
  return null;
}

export function toReadablePositionLabel(
  word: string,
  unitType: string,
  patternKey: string
): string {
  const n = nFromUnitTypeLabel(unitType);
  if (n == null) return "—";
  const idx = firstMatchCharIndex(word, unitType, patternKey);
  if (idx == null) return "No match in word";
  const ch = charUnits(word);
  const len = ch.length;
  if (idx === 0) return "Word start";
  if (idx + n === len) return "Word end";
  return `Middle · index ${idx}`;
}

function positionBucketLabel(charIndex: number): string {
  if (charIndex === 0) return "Word start";
  return `Index ${charIndex}`;
}

export type PatternFormattedRow = {
  word: string;
  hits: number;
  positionLabel: string;
};

export type PatternPositionDistribution = {
  label: string;
  count: number;
  share: number;
};

export type PatternFormatted = {
  displayLiteral: string;
  summaryLine: string;
  commonPositionsLine: string;
  rows: PatternFormattedRow[];
  positionDistribution: PatternPositionDistribution[];
};

export function formatPatternResults(
  topWordsRes: PatternTopWordsResponse,
  positionsRes: PatternPositionsResponse
): PatternFormatted {
  const { pattern, top_words } = topWordsRes;
  const literal = parsePatternLiteral(pattern.pattern_key, pattern.unit_type) ?? pattern.pattern_key;
  const positions = positionsRes.positions ?? [];
  const totalPosCount = positions.reduce((s, p) => s + p.count, 0);

  const positionDistribution: PatternPositionDistribution[] =
    totalPosCount > 0
      ? positions.map((p) => ({
          label: positionBucketLabel(p.char_index),
          count: p.count,
          share: p.count / totalPosCount,
        }))
      : [];

  const sorted = [...positionDistribution].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3);
  const commonPositionsLine =
    top.length === 0
      ? "No position histogram for this pattern."
      : `Most common start positions: ${top.map((t) => `${t.label} (${Math.round(t.share * 100)}%)`).join(", ")}`;

  const rows: PatternFormattedRow[] = top_words.map((tw) => ({
    word: tw.word,
    hits: tw.hits,
    positionLabel: toReadablePositionLabel(tw.word, pattern.unit_type, pattern.pattern_key),
  }));

  const summaryLine = `Pattern "${literal}" · ${top_words.length} matched words in this sample · corpus freq ${pattern.corpus_freq}`;

  return {
    displayLiteral: literal,
    summaryLine,
    commonPositionsLine,
    rows,
    positionDistribution,
  };
}

export type NeighborFormattedRow = {
  neighbor: string;
  count: number;
  pmiDisplay: string;
  strengthNote: string;
  isSparse: boolean;
};

export type NeighborFormatted = {
  headline: string;
  quickRead: string;
  rows: NeighborFormattedRow[];
  maxCount: number;
};

function formatPmi(pmi: number | null | undefined): string {
  if (pmi == null || Number.isNaN(pmi)) return "—";
  return pmi.toFixed(2);
}

export function formatNeighborResults(res: NeighborsResponse): NeighborFormatted {
  const neighbors = res.neighbors ?? [];
  const maxCount = neighbors.reduce((m, r) => Math.max(m, r.count), 0);
  const sparseThreshold = Math.max(1, Math.floor(maxCount * 0.08));

  const rows: NeighborFormattedRow[] = neighbors.map((r) => {
    const isSparse = r.count < sparseThreshold;
    const pmiDisplay = formatPmi(r.pmi);
    const strengthNote =
      r.pmi == null || Number.isNaN(r.pmi!)
        ? "PMI not computed for KB neighbors"
        : isSparse
          ? "Sparse in this vocab"
          : "Frequent co-occurrence";
    return {
      neighbor: r.neighbor,
      count: r.count,
      pmiDisplay,
      strengthNote,
      isSparse,
    };
  });

  const sidePhrase = res.side === "left" ? "to the left of" : "to the right of";
  const headline = `Common letters ${sidePhrase} "${res.letter}" · ${neighbors.length} neighbor types`;

  const top2 = neighbors.slice(0, 2);
  const rare = neighbors.filter((r) => r.count < sparseThreshold).slice(0, 6);

  let quickRead = "";
  if (top2.length === 0) quickRead = "No neighbor rows returned.";
  else if (top2.length === 1) {
    quickRead = `"${res.letter}" is most often ${res.side === "right" ? "followed" : "preceded"} by "${top2[0]!.neighbor}".`;
  } else {
    quickRead = `"${res.letter}" is most often ${res.side === "right" ? "followed" : "preceded"} by "${top2[0]!.neighbor}" and "${top2[1]!.neighbor}".`;
  }
  if (rare.length) {
    const letters = rare.map((r) => `"${r.neighbor}"`).join(", ");
    quickRead += ` ${letters} ${rare.length === 1 ? "is" : "are"} relatively rare here.`;
  }

  return { headline, quickRead, rows, maxCount };
}

export type ParsedComboKey = {
  wordLength: number;
  segmentCount: number;
  labelTag: string;
};

export function parseCoverageComboKey(comboKey: string): ParsedComboKey | null {
  const parts = comboKey.split("|");
  const map: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split(":");
    if (k && v !== undefined) map[k] = v;
  }
  const w = map.wlen;
  const n = map.nseg;
  const lab = map.lab;
  if (w === undefined || n === undefined || lab === undefined) return null;
  const wordLength = parseInt(w, 10);
  const segmentCount = parseInt(n, 10);
  if (Number.isNaN(wordLength) || Number.isNaN(segmentCount)) return null;
  return { wordLength, segmentCount, labelTag: lab };
}

export function toBucketTitle(parsed: ParsedComboKey): string {
  const lab =
    parsed.labelTag === "none" || parsed.labelTag === ""
      ? "unlabeled"
      : `label: ${parsed.labelTag}`;
  return `${parsed.wordLength}-letter words · ${parsed.segmentCount} known segment${parsed.segmentCount === 1 ? "" : "s"} · ${lab}`;
}

export type GapUrgency = {
  badge: string;
  description: string;
  tone: "zinc" | "amber" | "rose";
};

const DEFICIT_CRITICAL = 0.75;
const DEFICIT_HIGH = 0.5;
const DEFICIT_MEDIUM = 0.25;

export function toPatternGapUrgency(row: UnderCoveredPatternRow): GapUrgency {
  const d = row.deficit;
  if (d >= DEFICIT_CRITICAL)
    return { badge: "Critical", description: "Large gap vs labeling target", tone: "rose" };
  if (d >= DEFICIT_HIGH)
    return { badge: "High", description: "Needs more labeled examples", tone: "amber" };
  if (d >= DEFICIT_MEDIUM)
    return { badge: "Medium", description: "Below target; worth monitoring", tone: "amber" };
  return { badge: "Low", description: "Close to target", tone: "zinc" };
}

export function rankSegmentComboUrgencies(rows: SegmentComboRow[]): Map<string, GapUrgency> {
  const n = rows.length;
  const out = new Map<string, GapUrgency>();
  if (n === 0) return out;

  const sorted = [...rows].sort(
    (a, b) => a.count_labeled - b.count_labeled || a.combo_key.localeCompare(b.combo_key)
  );

  for (let i = 0; i < sorted.length; i++) {
    const rank = n === 1 ? 0.5 : i / (n - 1);
    const row = sorted[i]!;
    if (rank <= 0.33) {
      out.set(row.combo_key, {
        badge: "Lower slice",
        description: "Fewer labeled examples in this bucket vs peers",
        tone: "amber",
      });
    } else if (rank >= 0.66) {
      out.set(row.combo_key, {
        badge: "Stronger slice",
        description: "More labeled coverage in this bucket",
        tone: "zinc",
      });
    } else {
      out.set(row.combo_key, {
        badge: "Mid",
        description: "Typical labeled volume for this snapshot",
        tone: "zinc",
      });
    }
  }
  return out;
}

export function isCoverageGapsWithGap(
  res: { gap: unknown; detail?: string; computed_at?: string | null }
): res is { computed_at: string | null; gap: CoverageGapPayload } {
  const g = res.gap;
  if (g == null || typeof g !== "object" || Array.isArray(g)) return false;
  const o = g as Record<string, unknown>;
  return Array.isArray(o.under_covered_patterns) && Array.isArray(o.segment_combos);
}
