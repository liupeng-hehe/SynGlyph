"""Cycle counting on synthetic skeleton masks."""

import numpy as np

from glyph_shape_family.loops_cycles import count_skeleton_loops


def test_empty_zero():
    assert count_skeleton_loops(np.zeros((5, 5), dtype=bool)) == 0


def test_vertical_line_tree():
    m = np.zeros((7, 3), dtype=bool)
    m[:, 1] = True
    assert count_skeleton_loops(m) == 0


def test_simple_ring_all_degree2():
    # 4x4 hollow square perimeter (single-pixel thickness)
    m = np.zeros((4, 4), dtype=bool)
    m[0, :] = m[-1, :] = True
    m[:, 0] = m[:, -1] = True
    assert count_skeleton_loops(m) == 1


def test_two_parallel_lines_no_loop():
    m = np.zeros((5, 5), dtype=bool)
    m[:, 1] = m[:, 3] = True
    assert count_skeleton_loops(m) == 0
