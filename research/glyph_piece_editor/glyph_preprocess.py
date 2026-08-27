"""
Grayscale → binary → skeleton → contours → keypoints.
Mirror of apps/web/lib/glyph-editor/preprocess.ts for batch / validation.
"""
from __future__ import annotations

import numpy as np
from skimage import morphology, measure
from skimage.filters import threshold_otsu


def binarize(gray: np.ndarray) -> np.ndarray:
    """gray → binary uint8 0/1 with ink as minority region (glyph strokes = 1)."""
    g = gray.astype(np.float64)
    t = threshold_otsu(g)
    bin_img = (g < t).astype(np.uint8)
    if bin_img.mean() > 0.5:
        bin_img = 1 - bin_img
    return bin_img


def largest_component(bin_img: np.ndarray) -> np.ndarray:
    lab = measure.label(bin_img, connectivity=2)
    if lab.max() == 0:
        return bin_img
    counts = np.bincount(lab.ravel())[1:]
    keep = 1 + int(np.argmax(counts))
    return (lab == keep).astype(np.uint8)


def skeletonize(bin_img: np.ndarray) -> np.ndarray:
    return morphology.skeletonize(bin_img > 0).astype(np.uint8)


def keypoints_from_skeleton(sk: np.ndarray) -> dict:
    h, w = sk.shape
    endpoints, junctions = [], []

    def ncount(y, x):
        if not sk[y, x]:
            return 0
        c = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == dy == 0:
                    continue
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and sk[ny, nx]:
                    c += 1
        return c

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not sk[y, x]:
                continue
            n = ncount(y, x)
            if n == 1:
                endpoints.append((x, y))
            elif n >= 3:
                junctions.append((x, y))
    return {"endpoints": endpoints, "junctions": junctions, "curvature_peaks": [], "anchors": []}


def preprocess_pipeline(gray: np.ndarray) -> dict:
    """Returns dict with binary, skeleton, keypoints, shape."""
    b = largest_component(binarize(gray))
    sk = skeletonize(b)
    kp = keypoints_from_skeleton(sk)
    return {
        "binary": b,
        "skeleton": sk,
        "keypoints": kp,
        "height": b.shape[0],
        "width": b.shape[1],
    }
