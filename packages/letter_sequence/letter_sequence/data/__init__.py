"""Data package.

`preprocess_letter_sequences` has no torch dependency. Dataset/collate live in
`sequence_dataset` and import torch — use lazy exports so `build_letter_sequence_dataset`
can run without PyTorch installed.
"""

from __future__ import annotations

__all__ = ["LetterSequenceDataset", "collate_letter_batch"]


def __getattr__(name: str):
    if name in __all__:
        from letter_sequence.data.sequence_dataset import LetterSequenceDataset, collate_letter_batch

        return {"LetterSequenceDataset": LetterSequenceDataset, "collate_letter_batch": collate_letter_batch}[
            name
        ]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
