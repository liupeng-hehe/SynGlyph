"""Pydantic schemas for letter-sequence training runs and snapshots."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

LetterSequenceModelFamily = Literal["bilstm", "mlp"]


class TrainingHyperParams(BaseModel):
    """Hyperparameters for Workbench / API. Family-specific keys may be ignored by the trainer for other families."""

    model_family: LetterSequenceModelFamily = "bilstm"
    epochs: int = Field(30, ge=1, le=5000)
    learning_rate: float = Field(0.001, gt=0, le=1.0)
    batch_size: int = Field(16, ge=1, le=4096)
    hidden_size: int = Field(128, ge=8, le=4096)
    num_layers: int = Field(1, ge=1, le=8)
    dropout: float = Field(0.1, ge=0, le=0.9)
    weight_decay: float = Field(0.0001, ge=0, le=1.0)
    train_ratio: float = Field(0.8, gt=0, lt=1)
    split_seed: int = Field(42)
    loss_lab: float = Field(1.0, ge=0)
    loss_prominence: float = Field(1.0, ge=0)
    loss_spread: float = Field(1.0, ge=0)
    loss_boundary: float = Field(1.0, ge=0)
    emb_dim: int = Field(64, ge=8, le=512)
    pos_dim: int = Field(16, ge=4, le=128)


class CreateTrainingRunRequest(BaseModel):
    dataset_id: str | None = None  # None or "" => fetch-global stimuli
    hyperparams: TrainingHyperParams = Field(default_factory=TrainingHyperParams)


class TrainingRunResponse(BaseModel):
    id: str
    status: str
    dataset_id: str | None
    out_dir: str
    config_json: str
    error_message: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    best_val_loss: float | None = None
    n_samples: int | None = None
    n_unique_words: int | None = None
    process_pid: int | None = None


class TrainingMetricsResponse(BaseModel):
    run_id: str
    status: str
    progress: dict[str, Any] | None = None
    metrics_json: dict[str, Any] | None = None


class CreateSnapshotRequest(BaseModel):
    """Optional display name; server auto-generates if omitted."""

    name: str | None = None


class ModelSnapshotResponse(BaseModel):
    id: str
    training_run_id: str
    name: str
    checkpoint_uri: str
    config_json: str
    best_val_loss: float | None = None
    n_samples: int | None = None
    n_unique_words: int | None = None
    created_at: str
    model_family: str | None = None
    metrics_json: dict[str, Any] | None = None
    dataset_version_id: str | None = None
    git_sha: str | None = None
