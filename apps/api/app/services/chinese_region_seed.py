"""Initial region seeds from decomposition / matches / strokes — not ground truth."""

from __future__ import annotations

from typing import Any


def region_seeds_from_template(template: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Input: normalized template (character, decomposition, matches, strokes, medians).
    Output: candidate groupings with stroke id lists.
    """
    strokes = template.get("strokes") or []
    n = len(strokes) if isinstance(strokes, list) else 0
    if n == 0:
        return []

    decomp = template.get("decomposition")
    seeds: list[dict[str, Any]] = []

    # Heuristic: IDS with multiple parts → split strokes into contiguous chunks by component count
    if isinstance(decomp, str) and decomp and len(decomp) > 1:
        # Count rough component boundaries (⿰ ⿱ ⿲ … as split hints)
        parts = max(2, min(6, decomp.count("⿰") + decomp.count("⿱") + decomp.count("⿲") + decomp.count("⿳") + 2))
        chunk = max(1, (n + parts - 1) // parts)
        idx = 0
        g = 0
        while idx < n:
            end = min(n, idx + chunk)
            seeds.append(
                {
                    "id": f"seed-component-{g}",
                    "stroke_ids": list(range(idx, end)),
                    "label": f"component-{g}",
                }
            )
            idx = end
            g += 1
        return seeds

    # Default: one seed per stroke (user can merge later)
    return [
        {"id": f"seed-{i}", "stroke_ids": [i], "label": f"stroke-{i}"}
        for i in range(n)
    ]
