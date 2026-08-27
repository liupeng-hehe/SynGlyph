export type ReviewOutcome = "accept" | "minor_edit" | "reject";

export type ErrorType =
  | "wrong_color"
  | "wrong_span"
  | "wrong_intensity"
  | "wrong_boundary_transition"
  | "other";

export type Severity = "minor" | "medium" | "major";

export type Confidence = "low" | "medium" | "high";

export type SaveMode = "feedback" | "correction_sample" | "retraining_queue";

export type ColorSpace = "hex" | "rgb" | "oklch";

export interface ColorPayload {
  space: ColorSpace;
  value: string | number[];
}

export interface SelectedSpanPayload {
  start: number;
  end: number;
  selectedText: string;
  tokenIndex?: number;
  /** Canvas click: whole word vs single letter within word */
  clickMode?: "word" | "letter";
  /** Absolute char index in full text (letter mode); highlighted on canvas */
  focusCharIndex?: number | null;
}

export interface LetterPredictionEntry {
  charIndex: number;
  char: string;
  hex: string;
  /** Model head outputs, typically in [0, 1] */
  prominence: number;
  spread: number;
}

export interface PredictionPayload {
  predictedColor?: ColorPayload;
  /** Word-span averages (letters only) */
  predictedProminence?: number;
  predictedSpread?: number;
  /** Per-letter model colors for the selected word span */
  letterPredictions?: LetterPredictionEntry[];
  revealRadiusX?: number;
  revealRadiusY?: number;
  edgeFeather?: number;
  hoverFalloff?: number;
}

export interface LetterColorCorrectionEntry {
  charIndex: number;
  char: string;
  predictedColor: ColorPayload;
  correctedColor: ColorPayload;
  predictedProminence?: number;
  predictedSpread?: number;
  correctedProminence?: number;
  correctedSpread?: number;
}

/** Evaluate mode: how color mixing at a letter boundary should lean (annotation only). */
export interface LetterBoundaryMigrationEval {
  leftCharIndex: number;
  rightCharIndex: number;
  /** -1 = favor left letter color, 0 = neutral / balanced mix, +1 = favor right letter color */
  lean: number;
}

export interface FeedbackPayload {
  reviewOutcome: ReviewOutcome;
  errorType?: ErrorType;
  severity?: Severity;
  confidence?: Confidence;
  /** Word-level correction (e.g. single-letter word or legacy) */
  correctedColor?: ColorPayload;
  /** Per-letter corrections inside the selected word */
  letterColorCorrections?: LetterColorCorrectionEntry[];
  /** Evaluate: per adjacent-letter boundary, subjective lean of inter-letter color migration */
  letterBoundaryMigrationEval?: LetterBoundaryMigrationEval[];
  qualitativeTags?: string[];
  notes?: string;
  saveMode: SaveMode;
}

export interface ModelFeedbackRecord {
  id: string;
  checkpointId: string;
  text: string;
  selectedSpan: SelectedSpanPayload;
  prediction: PredictionPayload;
  feedback: FeedbackPayload;
  createdAt: string;
  updatedAt?: string;
}

export type ReviewMode = "preview" | "evaluate" | "correct";

/** How canvas clicks resolve: whole token vs one letter */
export type SpanClickMode = "word" | "letter";

export const QUALITATIVE_TAGS = [
  "warmer",
  "cooler",
  "lighter",
  "darker",
  "more_saturated",
  "less_saturated",
] as const;
