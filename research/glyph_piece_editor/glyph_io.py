"""
Save/load glyph JSON and export ML-friendly tables (pandas optional).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_glyph_json(path: str | Path) -> dict[str, Any]:
    with open(path) as f:
        return json.load(f)


def save_glyph_json(doc: dict[str, Any], path: str | Path) -> None:
    with open(path, "w") as f:
        json.dump(doc, f, indent=2)


def export_tables(doc: dict[str, Any]) -> dict[str, list[dict]]:
    g = doc.get("glyph", "")
    nodes = [{"glyph": g, **{k: n[k] for k in n if k != "node_id"}, "node_id": n["node_id"]} for n in doc.get("nodes", [])]
    pieces = [{"glyph": g, **p} for p in doc.get("pieces", [])]
    rels = [{"glyph": g, **r} for r in doc.get("relations", [])]
    return {"nodes": nodes, "pieces": pieces, "relations": rels}
