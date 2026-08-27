"""Fixed-size phonology feature layout (versioned for ONNX / checkpoints)."""

from __future__ import annotations

# v1: legacy-style bits + stress/syllable (concat order must stay stable for old dims).
PHON_LAYOUT_V1 = "phon_layout_v1"
# Total channels passed as extra_features [T, K] (mask separate in batch).
# 0-3: legacy (vowel, first, last, norm_len) — same semantics as _extra_features
# 4-15: structured phonology
PHON_LAYOUT_V1_DIM = 16

# Channel indices (for ablation: zero groups in collate)
LEGACY_SLICE = slice(0, 4)
SYLLABLE_STRESS_SLICE = slice(4, 12)  # syllable pos, in_stress, dist, roles...
NEIGHBOR_SLICE = slice(12, 16)

# Per-channel names for debugging / API (length = PHON_LAYOUT_V1_DIM)
PHON_V1_CHANNEL_NAMES: tuple[str, ...] = (
    "is_vowel",
    "is_initial",
    "is_final",
    "word_len_norm",
    "syllable_idx_norm",
    "in_stressed_syllable",
    "distance_to_stress_norm",
    "same_vowel_local",
    "prev_is_vowel",
    "next_is_vowel",
    "char_role_norm",
    "is_stressed_nucleus",
    "syllable_pos_start_norm",
    "syllable_pos_end_norm",
    "is_primary_stress_syllable",
    "pad_reserved",
)
