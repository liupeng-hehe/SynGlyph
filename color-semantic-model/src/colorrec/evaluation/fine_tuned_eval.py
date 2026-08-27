"""Orchestrate fine-tuned retrieval evaluation after training."""

from __future__ import annotations

import json
import logging

from omegaconf import DictConfig

from colorrec.config import get_path, resolve_path
from colorrec.evaluation.evaluate_retrieval import evaluate_split, render_markdown as render_eval_md
from colorrec.evaluation.metadata_holdout import ensure_metadata_holdout_files, metadata_holdout_available
from colorrec.evaluation.qualitative_report import run_qualitative_report, write_qualitative_outputs
from colorrec.inference.embed_candidates import embed_candidate_bank
from colorrec.inference.encoder import load_encoder

logger = logging.getLogger(__name__)

EVAL_SPLITS = ("val", "test", "metadata_val", "metadata_test")


def run_fine_tuned_eval(cfg: DictConfig, *, encoder=None) -> dict:
    final_model_dir = resolve_path(str(cfg.train.get("final_model_dir")))
    if not final_model_dir.exists():
        raise FileNotFoundError(
            f"Fine-tuned model not found at {final_model_dir}. Train first."
        )

    enc = encoder or load_encoder(cfg, model_path=str(final_model_dir))

    # Re-embed candidates with fine-tuned model
    embed_candidate_bank(
        cfg,
        encoder=enc,
        model_path=str(final_model_dir),
        embeddings_path=get_path(cfg, "fine_tuned_candidate_embeddings"),
        metadata_path=get_path(cfg, "candidate_metadata"),
        force=True,
    )

    if metadata_holdout_available(cfg):
        ensure_metadata_holdout_files(cfg)

    combined: dict = {"model": str(final_model_dir)}
    for split in EVAL_SPLITS:
        if split.startswith("metadata_") and not metadata_holdout_available(cfg):
            logger.warning("Skipping %s: metadata holdout unavailable", split)
            continue
        report = evaluate_split(
            cfg,
            split,
            encoder=enc,
            embeddings_path=get_path(cfg, "fine_tuned_candidate_embeddings"),
            model_name=str(final_model_dir),
        )
        combined[split] = report

    qual = run_qualitative_report(
        cfg,
        encoder=enc,
        embeddings_path=get_path(cfg, "fine_tuned_candidate_embeddings"),
        model_name=str(final_model_dir),
    )
    combined["qualitative"] = qual

    json_path = get_path(cfg, "fine_tuned_retrieval_json")
    md_path = get_path(cfg, "fine_tuned_retrieval_md")
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(combined, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")

    md_parts = [render_eval_md(combined[s]) for s in ("val", "test") if s in combined]
    for s in ("metadata_val", "metadata_test"):
        if s in combined:
            md_parts.append(render_eval_md(combined[s]))
    md_path.write_text("\n".join(md_parts), encoding="utf-8")

    write_qualitative_outputs(
        cfg,
        qual,
        json_path=get_path(cfg, "fine_tuned_qualitative_json"),
        md_path=get_path(cfg, "fine_tuned_qualitative_md"),
    )

    logger.info("Fine-tuned evaluation complete: %s", json_path)
    return combined
