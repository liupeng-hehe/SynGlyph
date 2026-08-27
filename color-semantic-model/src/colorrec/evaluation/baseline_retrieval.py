"""Orchestrate baseline retrieval: embed, evaluate val/test, qualitative report."""

from __future__ import annotations

import argparse
import json
import logging

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.evaluation.evaluate_retrieval import evaluate_split, get_split_metrics, render_markdown as render_eval_md
from colorrec.evaluation.metadata_holdout import ensure_metadata_holdout_files, metadata_holdout_available
from colorrec.evaluation.qualitative_report import (
    run_qualitative_report,
    write_qualitative_outputs,
)
from colorrec.inference.embed_candidates import embed_candidate_bank
from colorrec.inference.embedding_manifest import validate_embedding_cache
from colorrec.inference.encoder import load_encoder
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def run_baseline_retrieval(cfg, *, skip_embed: bool = False, encoder=None, force: bool = False) -> dict:
    emb_path = get_path(cfg, "candidate_embeddings")
    meta_path = get_path(cfg, "candidate_metadata")

    if skip_embed:
        validate_embedding_cache(cfg, embeddings_path=emb_path, metadata_path=meta_path)
    else:
        embed_candidate_bank(cfg, encoder=encoder, force=force)

    enc = encoder or load_encoder(cfg)

    val_report = evaluate_split(cfg, "val", encoder=enc)
    test_report = evaluate_split(cfg, "test", encoder=enc)

    combined = {"val": val_report, "test": test_report}

    if metadata_holdout_available(cfg):
        ensure_metadata_holdout_files(cfg)
        combined["metadata_val"] = evaluate_split(cfg, "metadata_val", encoder=enc)
        combined["metadata_test"] = evaluate_split(cfg, "metadata_test", encoder=enc)

    qual_report = run_qualitative_report(cfg, encoder=enc)
    combined["qualitative"] = qual_report

    json_path = get_path(cfg, "baseline_retrieval_json")
    md_path = get_path(cfg, "baseline_retrieval_md")
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(combined, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")

    md_parts = [render_eval_md(val_report), render_eval_md(test_report)]
    if "metadata_val" in combined:
        md_parts.append(render_eval_md(combined["metadata_val"]))
    if "metadata_test" in combined:
        md_parts.append(render_eval_md(combined["metadata_test"]))
    md_path.write_text("\n".join(md_parts), encoding="utf-8")

    write_qualitative_outputs(cfg, qual_report)

    logger.info(
        "Baseline complete: val recall@1=%.4f test recall@1=%.4f",
        get_split_metrics(val_report, "exact").get("recall@1", 0.0),
        get_split_metrics(test_report, "exact").get("recall@1", 0.0),
    )
    return combined


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run full baseline retrieval pipeline.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument("--skip-embed", action="store_true", help="Do not auto-run embed_candidates")
    parser.add_argument("--force", action="store_true", help="Force re-embed candidates before eval")
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    logger.info("Project root: %s", get_project_root())
    run_baseline_retrieval(cfg, skip_embed=args.skip_embed, force=args.force)


if __name__ == "__main__":
    main()
