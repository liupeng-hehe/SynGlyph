"""
Apply cut markers as blocked skeleton pixels; 8-connected components = pieces.
"""
from __future__ import annotations

import numpy as np


def apply_cuts(skeleton: np.ndarray, cuts: list[tuple[int, int]], radius: int = 2) -> np.ndarray:
    out = skeleton.copy()
    h, w = out.shape
    for cx, cy in cuts:
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                x, y = cx + dx, cy + dy
                if 0 <= x < w and 0 <= y < h:
                    out[y, x] = 0
    return out


def assign_foreground_geodesic(binary: np.ndarray, components: list[list[tuple[int, int]]]) -> np.ndarray:
    """
    Label each foreground 8-neighbor pixel by nearest skeleton component (BFS distance).
    Ties: smaller component index wins. Background = -1.
    """
    h, w = binary.shape
    label = np.full((h, w), -1, dtype=np.int32)
    dist = np.full((h, w), 10**9, dtype=np.int32)
    max_d = w * h + 4
    buckets: list[list[tuple[int, int]]] = [[] for _ in range(max_d)]

    for cid, pix in enumerate(components):
        for x, y in pix:
            if 0 <= x < w and 0 <= y < h and binary[y, x]:
                dist[y, x] = 0
                label[y, x] = cid
                buckets[0].append((x, y))

    n8 = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
    for d in range(max_d):
        for x, y in buckets[d]:
            if dist[y, x] != d:
                continue
            lab = int(label[y, x])
            for dx, dy in n8:
                nx, ny = x + dx, y + dy
                if nx < 0 or nx >= w or ny < 0 or ny >= h or not binary[ny, nx]:
                    continue
                nd = d + 1
                if nd >= max_d:
                    continue
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    label[ny, nx] = lab
                    buckets[nd].append((nx, ny))
                elif nd == dist[ny, nx] and lab < int(label[ny, nx]):
                    label[ny, nx] = lab
        buckets[d].clear()
    return label


def connected_components_skeleton(sk: np.ndarray) -> list[list[tuple[int, int]]]:
    h, w = sk.shape
    vis = np.zeros_like(sk, dtype=bool)
    comps: list[list[tuple[int, int]]] = []

    def neighbors8(x, y):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    yield nx, ny

    for y in range(h):
        for x in range(w):
            if not sk[y, x] or vis[y, x]:
                continue
            pix: list[tuple[int, int]] = []
            stack = [(x, y)]
            vis[y, x] = True
            while stack:
                cx, cy = stack.pop()
                pix.append((cx, cy))
                for nx, ny in neighbors8(cx, cy):
                    if sk[ny, nx] and not vis[ny, nx]:
                        vis[ny, nx] = True
                        stack.append((nx, ny))
            comps.append(pix)
    return comps
