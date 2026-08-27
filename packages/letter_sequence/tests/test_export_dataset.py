"""Deterministic export helpers: hash, canonical ↔ legacy."""

from letter_sequence.data.export_dataset import (
    canonical_to_v2_legacy,
    compute_dataset_hash,
    v2_sample_row_to_canonical,
)


def test_compute_dataset_hash_stable():
    v2 = {
        "schema_version": 2,
        "annotation_id": "a",
        "stimulus_id": "s",
        "word_text": "hi",
        "letters": ["h", "i"],
        "raw_input": "h|i",
        "target_lab": [[1, 2, 3], [4, 5, 6]],
        "target_prominence": [0.1, 0.2],
        "target_spread": [0.3, 0.4],
        "target_boundary": [0.5],
        "split": "train",
    }
    c = v2_sample_row_to_canonical(
        v2,
        stimulus_id="s",
        annotation_id="a",
        example_id="eid",
        split="train",
    )
    h1 = compute_dataset_hash([c])
    h2 = compute_dataset_hash([c])
    assert h1 == h2
    leg = canonical_to_v2_legacy(c)
    assert leg["schema_version"] == 2
    assert leg["split"] == "train"
