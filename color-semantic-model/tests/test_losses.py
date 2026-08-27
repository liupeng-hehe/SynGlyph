"""Tests for training loss factory."""

from __future__ import annotations

import sys
import types

import pytest

from colorrec.training import losses


class _FakeMNRL:
    def __init__(self, model):
        self.model = model


class _FakeTriplet:
    def __init__(self, model):
        self.model = model


def test_create_loss_mnrl(monkeypatch) -> None:
    fake_losses = types.SimpleNamespace(
        MultipleNegativesRankingLoss=_FakeMNRL,
        TripletLoss=_FakeTriplet,
    )
    fake_st = types.SimpleNamespace(losses=fake_losses)
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_st)

    model = object()
    loss = losses.create_loss(model, "mnrl")
    assert isinstance(loss, _FakeMNRL)
    assert loss.model is model


def test_create_loss_unknown() -> None:
    with pytest.raises(ValueError, match="Unknown loss"):
        losses.create_loss(object(), "not-a-loss")


def test_create_loss_missing_sentence_transformers(monkeypatch) -> None:
    monkeypatch.setitem(sys.modules, "sentence_transformers", None)
    with pytest.raises(ImportError, match="pip install -e '.\\[train\\]'"):
        losses.create_loss(object(), "mnrl")
