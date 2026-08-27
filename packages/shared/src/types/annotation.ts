export interface Dataset {
  id: string;
  name: string;
  created_at: string;
  owner?: string | null;
  is_canonical_root?: boolean;
  import_source?: string | null;
}

export interface Stimulus {
  id: string;
  text: string;
  language: string;
  source_type: string;
  created_at?: string;
  dataset_id?: string | null;
}

export interface Session {
  id: string;
  created_at: string;
}

export interface SegmentInput {
  text_span: string;
  color_lab: [number, number, number];
  prominence: number;
  spread: number;
}

export interface SpanResponse {
  id: string;
  segmentation_id: string;
  span_text: string;
  span_order: number;
  color_lab: [number, number, number];
  prominence: number;
  spread: number;
}

export interface ColorAnnotationResponse {
  id: string;
  annotation_id: string;
  target_type: string;
  span_id: string | null;
  hex_color: string;
  color_order: number;
}

export interface SegmentationResponse {
  id: string;
  annotation_id: string;
  raw_input: string;
  spans: SpanResponse[];
  boundary_influence?: number[];
}

export interface StimulusBriefResponse {
  id: string;
  text: string;
  language: string;
  source_type: string;
}

export interface AnnotationResponse {
  id: string;
  session_id: string;
  stimulus_id: string;
  created_at: string;
  stimulus?: StimulusBriefResponse;
  segmentation?: SegmentationResponse;
  color_annotations: ColorAnnotationResponse[];
}

export interface CreateStimulusRequest {
  text: string;
  language?: string;
  source_type?: string;
  dataset_id?: string | null;
}

export interface CreateAnnotationRequest {
  session_id: string;
  stimulus_id: string;
  segments: SegmentInput[];
  boundary_influence?: number[];
}

export interface SegmentMemoryResponse {
  id: string;
  segment_text: string;
  count: number;
  prefix_count: number;
  middle_count: number;
  suffix_count: number;
  avg_l: number;
  avg_a: number;
  avg_b: number;
  avg_prominence: number;
  avg_spread: number;
  example_words: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LetterPrior {
  avg_l: number;
  avg_a: number;
  avg_b: number;
  avg_prominence: number;
  avg_spread: number;
  count: number;
}

export type LetterPriorsResponse = Record<string, LetterPrior>;

export interface PrioritizedStimulus {
  stimulus_id: string;
  text: string;
  score: number;
  boundary_uncertainty: number;
  segment_attribute_uncertainty: number;
  segment_novelty: number;
  coverage_gain: number;
  instability: number;
}

export type RegistryStatus =
  | "unseen"
  | "candidate"
  | "selected"
  | "annotated"
  | "archived"
  | "blocked";

export interface ContextCombo {
  left_context_tokens: string[];
  right_context_tokens: string[];
  topic_hints: string[];
  domain_hints: string[];
  collocation_units: string[];
  position_signature?: string | null;
}

export interface ScoreBreakdown {
  demand_match_score: number;
  pattern_coverage_gain: number;
  context_coverage_gain: number;
  collocation_coverage_gain: number;
  frequency_utility: number;
  redundancy_penalty: number;
  annotation_cost: number;
}

export interface RecommendationExplain {
  reason: string;
  value?: number | null;
}

export interface RawCandidateDTO {
  word: string;
  normalized_word: string;
  lemma?: string | null;
  sources: string[];
  source_confidence: number;
  generation_signals: Record<string, number>;
  provider_payload_refs: Record<string, string>;
}

export interface EnrichedCandidateDTO extends RawCandidateDTO {
  pattern_features: Record<string, string | number | string[]>;
  context_combos: ContextCombo[];
  lexical_metadata: Record<string, string | number | string[] | null>;
  frequency_prior?: number | null;
  collocation_metadata: Record<string, string | number | string[] | null>;
  registry_status: RegistryStatus;
  exclusion_reason?: string | null;
}

export interface RankedCandidateDTO extends EnrichedCandidateDTO {
  score_breakdown: ScoreBreakdown;
  supply_score: number;
  rank?: number | null;
  why_selected: RecommendationExplain[];
  selected_for_output: boolean;
}

export interface DemandProfileGap {
  target: number;
  covered: number;
  gap_raw: number;
  gap_norm: number;
  priority: number;
}

export interface DemandProfile {
  selected_list_id: string;
  profile_version: string;
  exclude_selected_default: boolean;
  pattern_gaps: Array<DemandProfileGap & { pattern_key: string }>;
  context_gaps: Array<DemandProfileGap & { context_key: string }>;
  collocation_gaps: Array<DemandProfileGap & { collocation_key: string }>;
  coverage_state: {
    selected_list_id: string;
    computed_at: string;
    window: { annotated_count: number; selected_count: number; candidate_count: number };
    pattern: { targets: Record<string, number>; covered: Record<string, number>; gap_summary: Record<string, string | number> };
    context: { targets: Record<string, number>; covered: Record<string, number>; gap_summary: Record<string, string | number> };
    collocation: { targets: Record<string, number>; covered: Record<string, number>; gap_summary: Record<string, string | number> };
    normalization: Record<string, string>;
  };
}
