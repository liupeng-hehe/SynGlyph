"""Fine-tune a sentence-transformer on anchor-positive training pairs."""

from __future__ import annotations

import argparse
import json
import logging
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from omegaconf import DictConfig, OmegaConf

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.evaluation.metadata_holdout import load_metadata_holdout_pair_ids
from colorrec.inference.encoder import TRAIN_INSTALL_MSG, resolve_device
from colorrec.logging_utils import set_seed, setup_logging
from colorrec.training.evaluators import load_training_pairs_jsonl, make_sentence_transformer_dataset
from colorrec.training.losses import create_loss
from colorrec.training.oversampling import apply_weighted_oversampling, oversampling_settings

logger = logging.getLogger(__name__)


def sample_pairs(pairs: list, max_samples: int | None, seed: int) -> list:
    if max_samples is None or len(pairs) <= max_samples:
        return pairs
    rng = random.Random(seed)
    indices = sorted(rng.sample(range(len(pairs)), max_samples))
    return [pairs[i] for i in indices]


def _log_device() -> str:
    device = resolve_device("auto")
    logger.info("Training device: %s", device)
    try:
        import torch

        if torch.cuda.is_available():
            logger.info("CUDA available: %s", torch.cuda.get_device_name(0))
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            logger.info("MPS available")
        else:
            logger.info("Using CPU")
    except ImportError:
        logger.info("PyTorch not installed")
    return device


def prepare_training_pairs(cfg: DictConfig) -> list:
    train_path = get_path(cfg, "train_pairs")
    if not train_path.exists():
        raise FileNotFoundError(
            f"Training pairs not found at {train_path}. "
            "Run: python -m colorrec.data.build_training_pairs --config <config>"
        )

    bank_path = get_path(cfg, "candidate_bank_parquet")
    if not bank_path.exists():
        raise FileNotFoundError(
            f"Candidate bank not found at {bank_path}. "
            "Run: python -m colorrec.data.build_candidate_bank --config <config>"
        )

    pairs = load_training_pairs_jsonl(train_path)
    holdout_ids = load_metadata_holdout_pair_ids(cfg)
    if holdout_ids:
        before = len(pairs)
        pairs = [p for p in pairs if p.pair_id not in holdout_ids]
        logger.info(
            "Excluded %d metadata holdout pairs from training (%d -> %d)",
            before - len(pairs),
            before,
            len(pairs),
        )

    seed = int(cfg.train.get("seed", cfg.project.get("seed", 42)))
    max_train = cfg.train.get("max_train_samples")
    max_train = None if max_train is None else int(max_train)
    pairs = sample_pairs(pairs, max_train, seed)
    logger.info("Training on %d pairs", len(pairs))
    return pairs


def build_training_arguments(cfg: DictConfig, output_dir: Path):
    try:
        from sentence_transformers.training_args import BatchSamplers, SentenceTransformerTrainingArguments
    except ImportError as exc:
        raise ImportError(TRAIN_INSTALL_MSG) from exc

    batch_sampler = (
        BatchSamplers.NO_DUPLICATES
        if bool(cfg.train.get("use_no_duplicate_sampler", True))
        else BatchSamplers.BATCH_SAMPLER
    )

    return SentenceTransformerTrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=float(cfg.train.get("epochs", 1)),
        per_device_train_batch_size=int(cfg.train.get("batch_size", 16)),
        learning_rate=float(cfg.train.get("lr", 2.0e-5)),
        warmup_ratio=float(cfg.train.get("warmup_ratio", 0.1)),
        fp16=bool(cfg.train.get("fp16", False)),
        bf16=bool(cfg.train.get("bf16", False)),
        gradient_accumulation_steps=int(cfg.train.get("gradient_accumulation_steps", 1)),
        logging_steps=int(cfg.train.get("logging_steps", 50)),
        save_strategy=str(cfg.train.get("save_strategy", "epoch")),
        seed=int(cfg.train.get("seed", cfg.project.get("seed", 42))),
        batch_sampler=batch_sampler,
        dataloader_num_workers=int(cfg.train.get("num_workers", 0)),
        report_to=[],
    )


def train_model(
    cfg: DictConfig,
    *,
    model_factory=None,
    trainer_factory=None,
) -> dict[str, Any]:
    """Run MNRL fine-tuning and save the final model."""
    try:
        from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer
    except ImportError as exc:
        raise ImportError(TRAIN_INSTALL_MSG) from exc

    seed = int(cfg.train.get("seed", cfg.project.get("seed", 42)))
    set_seed(seed)
    _log_device()

    pairs = prepare_training_pairs(cfg)
    if not pairs:
        raise ValueError("No training pairs available after filtering/sampling")

    oversample_enabled, max_copies = oversampling_settings(cfg)
    train_pairs, oversampling_report = apply_weighted_oversampling(
        pairs,
        enabled=oversample_enabled,
        max_oversample_copies=max_copies,
    )
    logger.info(
        "Weighted oversampling: raw=%d effective=%d user_curated_share=%.3f",
        oversampling_report["raw_train_pairs"],
        oversampling_report["effective_train_examples"],
        oversampling_report["user_curated_effective_share"],
    )

    train_dataset = make_sentence_transformer_dataset(train_pairs)
    model_name = str(cfg.train.get("model_name", cfg.model.name))
    cache_dir = cfg.model.get("cache_dir")
    cache_path = str(resolve_path(str(cache_dir))) if cache_dir else None
    device = resolve_device(str(cfg.inference.get("device", "auto")))

    if model_factory is not None:
        model = model_factory(model_name)
    else:
        model = SentenceTransformer(model_name, cache_folder=cache_path, device=device)

    max_seq_length = int(cfg.train.get("max_seq_length", cfg.model.get("max_seq_length", 128)))
    model.max_seq_length = max_seq_length

    loss_name = str(cfg.train.get("loss", "mnrl"))
    loss = create_loss(model, loss_name)

    output_dir = resolve_path(str(cfg.train.get("output_dir", "models/color_sentence_transformer")))
    final_dir = resolve_path(str(cfg.train.get("final_model_dir", output_dir / "final")))
    output_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    args = build_training_arguments(cfg, output_dir)

    if trainer_factory is not None:
        trainer = trainer_factory(model=model, args=args, train_dataset=train_dataset, loss=loss)
        trainer.train()
    else:
        trainer = SentenceTransformerTrainer(
            model=model,
            args=args,
            train_dataset=train_dataset,
            loss=loss,
        )
        trainer.train()

    model.save(str(final_dir))
    logger.info("Saved final model to %s", final_dir)

    summary = {
        "model_name": model_name,
        "loss": loss_name,
        "train_pairs": oversampling_report["effective_train_examples"],
        "raw_train_pairs": oversampling_report["raw_train_pairs"],
        "effective_train_examples": oversampling_report["effective_train_examples"],
        "weighted_oversampling_enabled": oversampling_report["weighted_oversampling_enabled"],
        "max_oversample_copies": oversampling_report["max_oversample_copies"],
        "pairs_by_source_before": oversampling_report["pairs_by_source_before"],
        "pairs_by_source_after": oversampling_report["pairs_by_source_after"],
        "user_curated_effective_share": oversampling_report["user_curated_effective_share"],
        "epochs": float(cfg.train.get("epochs", 1)),
        "batch_size": int(cfg.train.get("batch_size", 16)),
        "lr": float(cfg.train.get("lr", 2.0e-5)),
        "output_dir": str(output_dir),
        "final_model_dir": str(final_dir),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    return summary


def write_train_summary(cfg: DictConfig, summary: dict[str, Any]) -> None:
    json_path = get_path(cfg, "train_summary_json")
    md_path = get_path(cfg, "train_summary_md")
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [
        "# Training Summary",
        "",
        f"- Model: `{summary.get('model_name')}`",
        f"- Loss: `{summary.get('loss')}`",
        f"- Raw train pairs: **{summary.get('raw_train_pairs', summary.get('train_pairs'))}**",
        f"- Effective train examples: **{summary.get('effective_train_examples', summary.get('train_pairs'))}**",
        f"- Weighted oversampling: **{summary.get('weighted_oversampling_enabled', False)}**",
        f"- Max oversample copies: **{summary.get('max_oversample_copies', 4)}**",
        f"- User curated effective share: **{summary.get('user_curated_effective_share', 0.0):.3f}**",
        f"- Epochs: **{summary.get('epochs')}**",
        f"- Batch size: **{summary.get('batch_size')}**",
        f"- Learning rate: **{summary.get('lr')}**",
        f"- Output dir: `{summary.get('output_dir')}`",
        f"- Final model: `{summary.get('final_model_dir')}`",
        f"- Finished: {summary.get('finished_at')}",
        "",
    ]

    before = summary.get("pairs_by_source_before")
    after = summary.get("pairs_by_source_after")
    if before or after:
        lines.extend(["## Pairs by source (before oversampling)", ""])
        for src, cnt in sorted((before or {}).items()):
            lines.append(f"- {src}: {cnt}")
        lines.extend(["", "## Pairs by source (after oversampling)", ""])
        for src, cnt in sorted((after or {}).items()):
            lines.append(f"- {src}: {cnt}")
        lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("Wrote train summary: %s", json_path)


def run_post_train_eval(cfg: DictConfig) -> None:
    from colorrec.evaluation.compare_runs import run_compare_runs
    from colorrec.evaluation.fine_tuned_eval import run_fine_tuned_eval

    run_fine_tuned_eval(cfg)
    run_compare_runs(cfg)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune a sentence-transformer for color retrieval.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument(
        "--run_eval_after_train",
        action="store_true",
        help="Re-embed candidates and run fine-tuned retrieval + compare reports",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    logger.info("Project root: %s", get_project_root())

    summary = train_model(cfg)
    write_train_summary(cfg, summary)

    if args.run_eval_after_train:
        run_post_train_eval(cfg)


if __name__ == "__main__":
    main()
