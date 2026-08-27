"""Active learning simulation on frozen canonical data (delegates to replay runner)."""

from __future__ import annotations

from typing import Any

from letter_sequence.al.experiment_train_config import default_train_cfg, merge_train_cfg
from letter_sequence.al.policy_config import AcquisitionPolicyConfig
from letter_sequence.al.replay import run_active_learning_replay


def _default_train_cfg(model_family: str) -> dict[str, Any]:
    """Backward-compatible alias for :func:`default_train_cfg`."""
    return default_train_cfg(model_family)


def _merge_train_cfg(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    return merge_train_cfg(base, override)


def run_active_learning_simulation(
    *,
    dataset_version_id: str,
    model_family: str,
    sampling_strategy: str,
    train_cfg: dict[str, Any] | None = None,
    experiment_run_id: str | None = None,
    initial_seed_size: int = 10,
    acquisition_batch_size: int = 5,
    max_rounds: int = 50,
    max_labeled_total: int = 100,
    random_seed: int = 42,
    train_epochs_per_round: int = 5,
) -> dict[str, Any]:
    """
    Legacy entry point: ``random`` | ``uncertainty`` maps to replay acquisition modes
    ``random`` and ``legacy_boundary_only`` (boundary entropy only), ``from_scratch`` training.
    """
    if sampling_strategy not in ("random", "uncertainty"):
        raise ValueError(sampling_strategy)
    mode = "random" if sampling_strategy == "random" else "legacy_boundary_only"
    return run_active_learning_replay(
        dataset_version_id=dataset_version_id,
        model_family=model_family,
        acquisition_mode=mode,
        replay_training_mode="from_scratch",
        policy=AcquisitionPolicyConfig(),
        train_cfg=train_cfg,
        experiment_run_id=experiment_run_id,
        initial_seed_size=initial_seed_size,
        acquisition_batch_size=acquisition_batch_size,
        max_rounds=max_rounds,
        max_labeled_total=max_labeled_total,
        random_seed=random_seed,
        train_epochs_per_round=train_epochs_per_round,
    )
