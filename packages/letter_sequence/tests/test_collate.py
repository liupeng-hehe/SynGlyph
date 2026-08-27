from letter_sequence.data.sequence_dataset import collate_letter_batch


def test_collate_masks_and_boundary():
    batch = [
        {
            "letters": ["c", "a", "t"],
            "target_lab": [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
            "target_prominence": [0.1, 0.2, 0.3],
            "target_spread": [0.4, 0.5, 0.6],
            "target_boundary": [0.7, 0.8],
        },
        {
            "letters": ["a"],
            "target_lab": [[1, 0, 0]],
            "target_prominence": [0.5],
            "target_spread": [0.5],
            "target_boundary": [],
        },
    ]
    b = collate_letter_batch(batch)
    assert b["input_ids"].shape == (2, 3)
    assert b["letter_mask"][0].sum() == 3
    assert b["letter_mask"][1].sum() == 1
    assert b["boundary_mask"][0, :2].sum() == 2
    assert b["boundary_mask"][1, :].sum() == 0


def test_collate_single_char_word():
    batch = [
        {
            "letters": ["x"],
            "target_lab": [[10, 20, 30]],
            "target_prominence": [1.0],
            "target_spread": [0.0],
            "target_boundary": [],
        }
    ]
    b = collate_letter_batch(batch)
    assert b["target_boundary"].shape[1] == 0 or b["boundary_mask"].sum() == 0
