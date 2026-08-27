"""
Pruned skeleton graph: nodes at degree-1 and degree≥3, edges as pixel paths.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class SkNode:
    id: str
    x: int
    y: int
    type: str  # endpoint | junction


@dataclass
class SkEdge:
    id: str
    fr: str
    to: str
    pixels: list[tuple[int, int]] = field(default_factory=list)


def _neighbors8(sk: np.ndarray, w: int, h: int, x: int, y: int) -> list[tuple[int, int]]:
    o = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and sk[ny, nx]:
                o.append((nx, ny))
    return o


def _ncount(sk: np.ndarray, w: int, h: int, x: int, y: int) -> int:
    return len(_neighbors8(sk, w, h, x, y))


def _is_graph_pixel(sk: np.ndarray, w: int, h: int, x: int, y: int) -> bool:
    if not sk[y, x]:
        return False
    n = _ncount(sk, w, h, x, y)
    return n == 1 or n >= 3


def build_skeleton_graph(sk: np.ndarray) -> tuple[list[SkNode], list[SkEdge]]:
    h, w = sk.shape
    nodes: list[SkNode] = []
    pix2id: dict[tuple[int, int], str] = {}
    nid = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not _is_graph_pixel(sk, w, h, x, y):
                continue
            t = "junction" if _ncount(sk, w, h, x, y) >= 3 else "endpoint"
            sid = f"n{nid}"
            nid += 1
            nodes.append(SkNode(sid, x, y, t))
            pix2id[(x, y)] = sid

    edges: list[SkEdge] = []
    seen: set[frozenset[str]] = set()
    eid = 0

    def trace(fr: SkNode, first: tuple[int, int]):
        path: list[tuple[int, int]] = [(fr.x, fr.y), first]
        prev = (fr.x, fr.y)
        cur = first
        while True:
            neigh = [p for p in _neighbors8(sk, w, h, cur[0], cur[1]) if p != prev]
            if not neigh:
                end = pix2id.get(cur)
                if end:
                    return path, end
                return None
            if len(neigh) > 1:
                end = pix2id.get(cur)
                if end:
                    path.append(cur)
                    return path, end
                return None
            nxt = neigh[0]
            path.append(nxt)
            if nxt in pix2id:
                return path, pix2id[nxt]
            prev, cur = cur, nxt

    for n in nodes:
        for nb in _neighbors8(sk, w, h, n.x, n.y):
            if nb in pix2id and pix2id[nb] != n.id:
                key = frozenset({n.id, pix2id[nb]})
                if key in seen:
                    continue
                seen.add(key)
                edges.append(SkEdge(f"e{eid}", n.id, pix2id[nb], [(n.x, n.y), nb]))
                eid += 1
                continue
            tr = trace(n, nb)
            if not tr:
                continue
            path, end_id = tr
            if not end_id:
                continue
            key = frozenset({n.id, end_id})
            if key in seen:
                continue
            seen.add(key)
            edges.append(SkEdge(f"e{eid}", n.id, end_id, list(path)))
            eid += 1

    return nodes, edges
