#!/usr/bin/env python3
"""CLI: export a LetterSequenceBiLSTM checkpoint to ONNX + export_report.json."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Monorepo: ensure letter_sequence package is importable when run from repo root
_REPO = Path(__file__).resolve().parents[1]
_pkg = _REPO / "packages" / "letter_sequence"
if _pkg.is_dir() and str(_pkg) not in sys.path:
    sys.path.insert(0, str(_pkg))

from letter_sequence.onnx.export_bilstm import export_bilstm_to_onnx  # noqa: E402


def main() -> None:
    import json

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("checkpoint", type=Path, help="Path to .pt checkpoint")
    ap.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        required=True,
        help="Directory for model.onnx and export_report.json",
    )
    ap.add_argument("--opset", type=int, default=14)
    ap.add_argument("--dry-run", action="store_true", help="Validate checkpoint only; do not write ONNX")
    args = ap.parse_args()
    report = export_bilstm_to_onnx(
        args.checkpoint,
        args.output_dir,
        opset=args.opset,
        dry_run=args.dry_run,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
