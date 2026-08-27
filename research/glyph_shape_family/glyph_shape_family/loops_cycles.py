"""Estimate number of independent cycles in a 1-pixel skeleton (main CC)."""

from __future__ import annotations

from typing import Optional

import numpy as np

from glyph_shape_family.geometry import largest_component_mask, neighbor_degrees8


def _neighbors8_sk(sk: np.ndarray, y: int, x: int) -> list[tuple[int, int]]:
    h, w = sk.shape
    o = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == dy == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and sk[ny, nx]:
                o.append((ny, nx))
    return o


def _trace_to_special(
    sk: np.ndarray,
    deg: np.ndarray,
    special: set[tuple[int, int]],
    start: tuple[int, int],
    first: tuple[int, int],
) -> Optional[tuple[int, int]]:
    """Follow a degree-2 chain from ``first`` until the next special pixel (not ``start``)."""
    prev = start
    cur = first
    h, w = sk.shape
    max_steps = int(sk.sum()) + 4
    for _ in range(max_steps):
        if cur in special and cur != start:
            return cur
        d = int(deg[cur[0], cur[1]])
        if d != 2:
            return None
        neigh = _neighbors8_sk(sk, cur[0], cur[1])
        nxt = [p for p in neigh if p != prev]
        if len(nxt) != 1:
            return None
        prev, cur = cur, nxt[0]
    return None


def count_skeleton_loops(mask: np.ndarray) -> int:
    """
    Count independent cycles in the skeleton graph (8-connected).

    Uses the **largest** foreground 8-CC only (same as other skeleton stats).

    - If all skeleton pixels have degree 2 (simple closed curve), returns 1.
    - Otherwise builds a compressed graph (vertices at degree != 2) and uses
      cyclomatic number per connected component: E - V + 1.
    """
    sk = largest_component_mask(mask.astype(bool)).mask
    if not sk.any():
        return 0
    deg = neighbor_degrees8(sk)
    sk_pixels = np.argwhere(sk)
    degrees_on = deg[sk]
    if np.all(degrees_on == 2):
        return 1

    h, w = sk.shape
    special: set[tuple[int, int]] = set()
    for y, x in sk_pixels:
        if int(deg[y, x]) != 2:
            special.add((int(y), int(x)))

    if not special:
        return 1

    spec_list = sorted(special)
    idx = {p: i for i, p in enumerate(spec_list)}
    n_special = len(spec_list)
    edges: list[tuple[int, int]] = []
    seen: set[frozenset[int]] = set()

    for p in spec_list:
        py, px = p
        for q in _neighbors8_sk(sk, py, px):
            if q in special:
                a, b = idx[p], idx[q]
                if a == b:
                    continue
                key = frozenset((a, b))
                if key not in seen:
                    seen.add(key)
                    edges.append((a, b))
            else:
                if int(deg[q[0], q[1]]) == 2:
                    end = _trace_to_special(sk, deg, special, p, q)
                    if end is not None:
                        a, b = idx[p], idx[end]
                        if a != b:
                            key = frozenset((a, b))
                            if key not in seen:
                                seen.add(key)
                                edges.append((a, b))

    # Connected components on vertices that appear in edges; isolated vertices are trees with 0 cycles
    parent = list(range(n_special))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for a, b in edges:
        union(a, b)

    comp_vertices: dict[int, set[int]] = {}
    comp_edges: dict[int, list[tuple[int, int]]] = {}
    for a, b in edges:
        r = find(a)
        comp_edges.setdefault(r, []).append((a, b))
        comp_vertices.setdefault(r, set()).add(a)
        comp_vertices[r].add(b)

    total = 0
    for r, es in comp_edges.items():
        vs = comp_vertices[r]
        v_count = len(vs)
        e_count = len(es)
        total += max(0, e_count - v_count + 1)
    return int(total)
