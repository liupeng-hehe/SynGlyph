#!/usr/bin/env python3
"""Re-read examples.jsonl and print stats / quality summaries (optional rewrite quality_report)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_API = _REPO / "apps" / "api"
sys.path.insert(0, str(_API))


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dataset-version-id", help="UUID under artifacts/datasets/{id}/")
    g.add_argument("--artifact-path", type=Path, help="Directory containing examples.jsonl")
    ap.add_argument("--write-quality-report", action="store_true")
    args = ap.parse_args()

    from app.services.artifact_paths import dataset_version_dir
    from app.services.chinese_dataset_export import load_examples_from_artifact
    from app.services.chinese_dataset_quality import collect_issues_for_example, merge_issue_counts

    if args.artifact_path:
        base = Path(args.artifact_path).resolve()
    else:
        base = dataset_version_dir(args.dataset_version_id)

    ex_path = base / "examples.jsonl"
    if not ex_path.is_file():
        raise SystemExit(f"Missing {ex_path}")

    rows = load_examples_from_artifact(ex_path)
    all_issues: list[dict] = []
    for row in rows:
        all_issues.extend(collect_issues_for_example(row))

    counts = merge_issue_counts(all_issues)
    print("examples:", len(rows))
    print("issues_total:", len(all_issues))
    print("issue_counts:", json.dumps(counts, indent=2))

    stats_path = base / "stats.json"
    if stats_path.is_file():
        print("stats.json:", stats_path.read_text(encoding="utf-8")[:2000])

    if args.write_quality_report:
        n_err = sum(1 for x in all_issues if x.get("severity") == "error")
        n_warn = sum(1 for x in all_issues if x.get("severity") == "warning")
        n_info = sum(1 for x in all_issues if x.get("severity") == "info")
        rep = {
            "issue_counts": counts,
            "issues": all_issues,
            "summary": {
                "n_errors": n_err,
                "n_warnings": n_warn,
                "n_infos": n_info,
                "n_total": len(all_issues),
            },
        }
        out_q = base / "quality_report.json"
        out_q.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Wrote", out_q)


if __name__ == "__main__":
    main()
