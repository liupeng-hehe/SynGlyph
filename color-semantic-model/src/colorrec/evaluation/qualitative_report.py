"""Qualitative top-k report for fixed evaluation prompts."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

from omegaconf import DictConfig

from colorrec.config import get_path, load_config, resolve_path
from colorrec.inference.encoder import TextEncoder, load_encoder
from colorrec.inference.search import cosine_search, load_candidate_index
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def run_qualitative_report(
    cfg: DictConfig,
    *,
    encoder: TextEncoder | None = None,
    prompts: list[str] | None = None,
    embeddings_path: Path | None = None,
    metadata_path: Path | None = None,
    model_path: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    emb_path = embeddings_path or get_path(cfg, "candidate_embeddings")
    meta_path = metadata_path or get_path(cfg, "candidate_metadata")
    embeddings, metadata = load_candidate_index(emb_path, meta_path)

    enc = encoder or load_encoder(cfg, model_path=model_path)
    prompt_list = prompts or list(cfg.evaluation.get("fixed_prompts", []))
    top_k = int(cfg.inference.get("top_k_default", 8))
    normalize = bool(cfg.inference.get("normalize_embeddings", True))
    resolved_model = model_name or model_path or str(cfg.model.name)

    results: dict[str, Any] = {"model": resolved_model, "top_k": top_k, "prompts": {}}
    for prompt in prompt_list:
        hits = cosine_search(
            prompt,
            enc,
            embeddings,
            metadata,
            top_k,
            normalize_embeddings=normalize,
            include_explanation=True,
        )
        results["prompts"][prompt] = hits
    return results


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Qualitative Retrieval Report",
        "",
        f"- Model: `{report.get('model')}`",
        f"- top_k: **{report.get('top_k')}**",
        "",
    ]
    for prompt, hits in report.get("prompts", {}).items():
        lines.extend(
            [
                f"## {prompt}",
                "",
                "| rank | name | hex | family | source | score | descriptor | explanation |",
                "| ---: | --- | --- | --- | --- | ---: | --- | --- |",
            ]
        )
        for hit in hits:
            desc = str(hit.get("descriptor", "")).replace("|", "\\|")
            if len(desc) > 80:
                desc = desc[:77] + "..."
            expl = str(hit.get("explanation", "")).replace("|", "\\|")
            lines.append(
                f"| {hit['rank']} | {hit.get('name')} | {hit.get('hex')} | {hit.get('family')} | "
                f"{hit.get('source')} | {hit.get('score', 0):.3f} | {desc} | {expl} |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def write_qualitative_outputs(
    cfg: DictConfig,
    report: dict[str, Any],
    *,
    json_path: Path | None = None,
    md_path: Path | None = None,
) -> None:
    json_out = json_path or get_path(cfg, "baseline_qualitative_json")
    md_out = md_path or get_path(cfg, "baseline_qualitative_md")
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    md_out.write_text(render_markdown(report), encoding="utf-8")
    logger.info("Wrote qualitative JSON: %s", json_out)
    logger.info("Wrote qualitative MD: %s", md_out)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate qualitative retrieval report for fixed prompts.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument("--model_path", type=str, default=None)
    parser.add_argument("--embeddings", type=str, default=None)
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    report = run_qualitative_report(
        cfg,
        model_path=args.model_path,
        embeddings_path=resolve_path(args.embeddings) if args.embeddings else None,
    )
    write_qualitative_outputs(cfg, report)


if __name__ == "__main__":
    main()
