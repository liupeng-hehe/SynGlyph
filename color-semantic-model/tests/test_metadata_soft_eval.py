"""Tests for metadata soft evaluation metrics."""

from __future__ import annotations

import numpy as np
import pandas as pd

from colorrec.evaluation.evaluate_retrieval import (
    build_anchor_group_index,
    build_family_soft_relevant_set,
    build_relevant_set,
    get_relevant_for_mode,
    get_split_metrics,
    recall_at_k,
)
from colorrec.schemas import TrainingPair


def _metadata_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "color_id": "c_red1",
                "hex": "#FF0000",
                "family": "red",
                "descriptor": "red warm",
            },
            {
                "color_id": "c_red2",
                "hex": "#CC0000",
                "family": "red",
                "descriptor": "red deep",
            },
            {
                "color_id": "c_blue1",
                "hex": "#0000FF",
                "family": "blue",
                "descriptor": "blue calm",
            },
        ]
    )


def test_anchor_group_expands_relevant_set() -> None:
    pairs = [
        TrainingPair(
            pair_id="p1",
            anchor="Calm Blue",
            positive="d1",
            positive_color_id="c_blue1",
            source="color_pedia_metadata",
            weight=1.0,
        ),
        TrainingPair(
            pair_id="p2",
            anchor="calm blue",
            positive="d2",
            positive_color_id="c_red1",
            source="color_pedia_metadata",
            weight=1.0,
        ),
    ]
    metadata = _metadata_df()
    index = build_anchor_group_index(pairs)
    exact, _ = build_relevant_set(pairs[0], metadata)
    grouped = get_relevant_for_mode(
        "anchor_group",
        pairs[0],
        metadata,
        anchor_group_index=index,
        exact_relevant=exact,
    )
    assert exact == {"c_blue1"}
    assert grouped == {"c_blue1", "c_red1"}


def test_family_soft_relevant_set() -> None:
    metadata = _metadata_df()
    pair = TrainingPair(
        pair_id="p1",
        anchor="warm",
        positive="p",
        positive_color_id="c_red1",
        source="color_pedia_metadata",
        weight=1.0,
        metadata={"color_family": "red"},
    )
    soft = build_family_soft_relevant_set(pair, metadata)
    assert soft == {"c_red1", "c_red2"}


def test_family_soft_recall_hits_same_family() -> None:
    metadata = _metadata_df()
    pair = TrainingPair(
        pair_id="p1",
        anchor="warm",
        positive="p",
        positive_color_id="c_red1",
        source="color_pedia_metadata",
        weight=1.0,
        metadata={"color_family": "red"},
    )
    exact, _ = build_relevant_set(pair, metadata)
    soft = get_relevant_for_mode(
        "family_soft",
        pair,
        metadata,
        anchor_group_index={},
        exact_relevant=exact,
    )
    retrieved = ["c_blue1", "c_red2", "c_red1"]
    assert recall_at_k(exact, retrieved, 1) == 0.0
    assert recall_at_k(soft, retrieved, 1) == 0.0
    assert recall_at_k(soft, retrieved, 2) == 1.0


def test_get_split_metrics_nested_and_legacy() -> None:
    nested = {
        "metrics": {
            "exact": {"recall@1": 0.5},
            "anchor_group": {"recall@1": 0.7},
        }
    }
    assert get_split_metrics(nested, "exact")["recall@1"] == 0.5
    assert get_split_metrics(nested, "anchor_group")["recall@1"] == 0.7

    legacy = {"metrics": {"recall@1": 0.4}}
    assert get_split_metrics(legacy, "exact")["recall@1"] == 0.4
