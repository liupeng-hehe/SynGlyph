#!/usr/bin/env python3
"""Merge generated teacher datasets into user_curated training CSVs.

This script is intentionally conservative:
- creates timestamped backups before writing
- dedupes pairs by (anchor_text, positive_hex)
- dedupes palette rows by hex
- can run in --dry-run mode first
"""

from __future__ import annotations

import argparse
import csv
import shutil
from datetime import datetime
from pathlib import Path


PAIR_HEADER = [
    "anchor_text",
    "positive_color_name",
    "positive_hex",
    "positive_descriptor",
    "color_family",
    "weight",
]

PALETTE_HEADER = ["name", "hex", "family", "descriptor", "keywords", "weight"]


ROOT = Path(__file__).resolve().parents[1]
USER_DIR = ROOT / "data/raw/user_curated"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = path.with_suffix(path.suffix + f".bak-{stamp}")
    shutil.copy2(path, dst)
    return dst


def norm_hex(v: str) -> str:
    s = (v or "").strip().upper()
    if s and not s.startswith("#"):
        s = f"#{s}"
    return s


def dedupe_pairs(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for row in rows:
        anchor = " ".join((row.get("anchor_text") or "").lower().split())
        hx = norm_hex(row.get("positive_hex") or "")
        if not anchor or not hx:
            continue
        key = (anchor, hx)
        if key in seen:
            continue
        seen.add(key)
        cleaned = {k: row.get(k, "") for k in PAIR_HEADER}
        cleaned["positive_hex"] = hx
        out.append(cleaned)
    return out


def pair_to_palette(row: dict[str, str], *, default_weight: str = "0.9") -> dict[str, str]:
    return {
        "name": row.get("positive_color_name", "").strip() or row.get("positive_hex", ""),
        "hex": norm_hex(row.get("positive_hex", "")),
        "family": row.get("color_family", "").strip(),
        "descriptor": row.get("positive_descriptor", "").strip()[:240],
        "keywords": row.get("anchor_text", "").strip()[:180],
        "weight": default_weight,
    }


def dedupe_palette(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for row in rows:
        hx = norm_hex(row.get("hex") or row.get("positive_hex") or "")
        if not hx or hx in seen:
            continue
        seen.add(hx)
        cleaned = {k: row.get(k, "") for k in PALETTE_HEADER}
        cleaned["hex"] = hx
        out.append(cleaned)
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Merge teacher datasets into training CSVs.")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--include-synthetic-studio", action="store_true")
    p.add_argument("--exclude-lab-uniform", action="store_true")
    p.add_argument("--exclude-hand-teacher", action="store_true")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    user_pairs_path = USER_DIR / "user_pairs.csv"
    curated_palette_path = USER_DIR / "curated_palette.csv"

    pair_sources: list[Path] = []
    palette_sources: list[Path] = []

    if not args.exclude_hand_teacher:
        pair_sources.append(USER_DIR / "teacher_color_collection.csv")
    if not args.exclude_lab_uniform:
        pair_sources.append(USER_DIR / "lab_uniform_teacher_5000_pairs.csv")
        palette_sources.append(USER_DIR / "lab_uniform_teacher_5000_palette.csv")
    if args.include_synthetic_studio:
        pair_sources.append(USER_DIR / "synthetic_studio_bulk_pairs.csv")
        palette_sources.append(USER_DIR / "synthetic_studio_bulk_palette.csv")

    existing_pairs = read_csv(user_pairs_path)
    incoming_pairs: list[dict[str, str]] = []
    for src in pair_sources:
        incoming_pairs.extend(read_csv(src))

    merged_pairs = dedupe_pairs(existing_pairs + incoming_pairs)

    existing_palette = read_csv(curated_palette_path)
    incoming_palette: list[dict[str, str]] = []
    # Generate palette entries from hand teacher pairs, because that file is pairs-only.
    if not args.exclude_hand_teacher:
        incoming_palette.extend(pair_to_palette(row, default_weight="1.0") for row in read_csv(USER_DIR / "teacher_color_collection.csv"))
    for src in palette_sources:
        incoming_palette.extend(read_csv(src))

    merged_palette = dedupe_palette(existing_palette + incoming_palette)

    print("Pair sources:")
    for src in pair_sources:
        print(f"  {src.relative_to(ROOT)} rows={len(read_csv(src))}")
    print("Palette sources:")
    for src in palette_sources:
        print(f"  {src.relative_to(ROOT)} rows={len(read_csv(src))}")
    print("")
    print(f"user_pairs: existing={len(existing_pairs)} incoming={len(incoming_pairs)} merged={len(merged_pairs)}")
    print(f"curated_palette: existing={len(existing_palette)} incoming={len(incoming_palette)} merged={len(merged_palette)}")

    if args.dry_run:
        print("\nDry run only; no files written.")
        return

    pair_backup = backup(user_pairs_path)
    palette_backup = backup(curated_palette_path)
    write_csv(user_pairs_path, PAIR_HEADER, merged_pairs)
    write_csv(curated_palette_path, PALETTE_HEADER, merged_palette)
    print(f"\nWrote {user_pairs_path.relative_to(ROOT)}")
    print(f"Wrote {curated_palette_path.relative_to(ROOT)}")
    print(f"Backups: {pair_backup.name}, {palette_backup.name}")


if __name__ == "__main__":
    main()
